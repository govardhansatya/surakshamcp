// TOOLS: configure_alert_channel, send_whatsapp_alert — the delivery channel that puts a
// safety alert on the foreman's / worker's phone. Uses Twilio's WhatsApp REST API directly
// (no SDK).
//
// Credentials are NEVER accepted as arguments to send_whatsapp_alert itself — MCP tool
// arguments transit the calling agent's context/logs, which is not a safe place for a bearer
// credential like a Twilio Auth Token. Instead, configure_alert_channel is a one-time, explicit
// setup call that stores a site's own credentials server-side (SQLite), so multiple sites/
// contractors can each bring their own Twilio account. Every subsequent send just resolves
// credentials by siteId — the secret is never re-transmitted or echoed back.
//
// Demo-safe by design: with no credentials configured (site-level or env var) the tool returns
// a dry-run payload describing exactly what would have been sent, instead of failing.
// Every send (real or dry-run) is logged to the alerts table → BRSR EI-12 "measures taken".
import { ToolDecorator as Tool, RateLimit, UseGuards, z, ExecutionContext, Injectable } from '@nitrostack/core';
import { IncidentStore } from '../../common/incident.store.js';
import { ApiKeyGuard } from '../infra/auth.guard.js';

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

function asWhatsApp(num: string): string {
  return num.startsWith('whatsapp:') ? num : `whatsapp:${num}`;
}

interface TwilioCreds {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  source: 'site-config' | 'env';
}

@Injectable()
export class NotifyTools {
  @Tool({
    name: 'configure_alert_channel',
    description:
      'One-time setup: store a site\'s own Twilio credentials for WhatsApp alerts, so that ' +
      'site\'s messages send from its own Twilio account instead of the server default. Call ' +
      'this once per site, then use send_whatsapp_alert normally — it will resolve the right ' +
      'credentials by siteId automatically. The auth token is stored server-side only and is ' +
      'never returned by any tool, including this one.',
    inputSchema: z.object({
      siteId: z.string().describe('Site these credentials belong to'),
      accountSid: z.string().min(10).describe('Twilio Account SID'),
      authToken: z.string().min(10).describe('Twilio Auth Token — stored server-side, never echoed back'),
      fromNumber: z.string().optional().describe('Twilio WhatsApp sender, e.g. whatsapp:+14155238886 (defaults to the Twilio sandbox number)'),
    }),
    taskSupport: 'forbidden',
  })
  @UseGuards(ApiKeyGuard) // stores credentials — sensitive, must not be open to any caller
  async configureAlertChannel(
    input: { siteId: string; accountSid: string; authToken: string; fromNumber?: string },
    ctx: ExecutionContext,
  ) {
    IncidentStore.setChannelConfig(input.siteId, 'whatsapp', {
      accountSid: input.accountSid,
      authToken: input.authToken,
      fromNumber: input.fromNumber || 'whatsapp:+14155238886',
    });
    ctx.logger?.info('configure_alert_channel', { siteId: input.siteId, channel: 'whatsapp' });
    return {
      configured: true,
      siteId: input.siteId,
      channel: 'whatsapp',
      accountSidMasked: `${input.accountSid.slice(0, 6)}…${input.accountSid.slice(-4)}`,
      note: 'Credentials stored. send_whatsapp_alert for this siteId will now use this account.',
    };
  }

  @Tool({
    name: 'send_whatsapp_alert',
    description:
      'Send a safety alert to a phone over WhatsApp (Twilio). Pair with generate_voice_alert: pass its ' +
      'audioUrl as mediaUrl so a low-literacy worker RECEIVES the spoken alert in their language on ' +
      'their own phone. Resolves credentials in order: the site\'s own config (set via ' +
      'configure_alert_channel), then the server default (TWILIO_* env vars). With neither ' +
      'configured, returns a dry-run payload instead of sending (safe for demos). Sends are ' +
      'logged as safety measures for ESG reporting.',
    inputSchema: z.object({
      to: z.string().min(8).describe('Recipient phone in E.164, e.g. +919876543210'),
      message: z.string().min(1).max(1600).describe('Alert text (worker\'s language preferred)'),
      mediaUrl: z.string().url().optional().describe('Public audio URL, e.g. audioUrl from generate_voice_alert'),
      language: z.string().optional().describe('ISO language code of the alert, for the record'),
      siteId: z.string().optional().describe('Site the alert relates to — also selects which Twilio account to send from'),
    }),
    taskSupport: 'forbidden',
  })
  @UseGuards(ApiKeyGuard) // real external send with a cost — must not be open to any caller
  @RateLimit({ requests: 10, window: '1m' }) // outbound messaging — throttle abuse
  async sendWhatsappAlert(
    input: { to: string; message: string; mediaUrl?: string; language?: string; siteId?: string },
    ctx: ExecutionContext,
  ) {
    const creds = this.resolveCreds(input.siteId);

    const record = (status: string) => IncidentStore.addAlert({
      siteId: input.siteId,
      channel: 'whatsapp',
      to: input.to,
      language: input.language,
      message: input.message,
      status,
    });

    if (!creds) {
      record('dry_run');
      ctx.logger?.info('send_whatsapp_alert', { mode: 'dry_run' });
      return {
        status: 'dry_run',
        delivered: false,
        wouldSend: { to: asWhatsApp(input.to), from: 'whatsapp:+14155238886', body: input.message, mediaUrl: input.mediaUrl ?? null },
        note: 'No Twilio credentials found (site-level or server default). Call configure_alert_channel ' +
          'for this site, or set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN on the server, to send for real.',
      };
    }

    const body = new URLSearchParams({ To: asWhatsApp(input.to), From: creds.fromNumber, Body: input.message });
    if (input.mediaUrl) body.set('MediaUrl', input.mediaUrl);

    const res = await fetch(`${TWILIO_API}/Accounts/${creds.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await res.json()) as { sid?: string; status?: string; message?: string; code?: number };
    if (!res.ok) {
      record('failed');
      throw new Error(`Twilio send failed (${res.status}): ${payload.message ?? 'unknown error'} [code ${payload.code ?? 'n/a'}]`);
    }

    record(payload.status ?? 'queued');
    ctx.logger?.info('send_whatsapp_alert', { mode: 'sent', twilioStatus: payload.status, credsFrom: creds.source });
    return {
      status: payload.status ?? 'queued',
      delivered: true,
      messageSid: payload.sid,
      to: asWhatsApp(input.to),
      language: input.language ?? null,
      withVoiceNote: !!input.mediaUrl,
      sentVia: creds.source === 'site-config' ? `site ${input.siteId}'s own Twilio account` : 'server default account',
    };
  }

  private resolveCreds(siteId?: string): TwilioCreds | null {
    if (siteId) {
      const stored = IncidentStore.getChannelConfig(siteId, 'whatsapp') as
        | { accountSid?: string; authToken?: string; fromNumber?: string }
        | null;
      if (stored?.accountSid && stored.authToken) {
        return {
          accountSid: stored.accountSid,
          authToken: stored.authToken,
          fromNumber: stored.fromNumber || 'whatsapp:+14155238886',
          source: 'site-config',
        };
      }
    }
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (sid && token) {
      return {
        accountSid: sid,
        authToken: token,
        fromNumber: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
        source: 'env',
      };
    }
    return null;
  }
}
