// HERO WORKFLOW — run_site_safety_audit implemented as a long-running MCP Task.
// Demonstrates agentic orchestration INSIDE the server: it composes the other tools,
// streams progress, supports cancellation, and can pause for human-in-the-loop approval.
// Covers BOTH hazard classes: static PPE compliance AND real-time proximity (struck-by).
import { ToolDecorator as Tool, UseInterceptors, z, ExecutionContext, Injectable } from '@nitrostack/core';
import { InferenceClient } from '../../common/inference.client.js';
import { SafetyService } from '../safety/safety.service.js';
import { LanguageService } from '../language/language.service.js';
import { IncidentStore } from '../../common/incident.store.js';
import { LoggingInterceptor } from '../infra/logging.interceptor.js';

@Injectable({ deps: [InferenceClient, SafetyService, LanguageService] })
export class AuditTools {
  constructor(
    private readonly inference: InferenceClient,
    private readonly safety: SafetyService,
    private readonly lang: LanguageService,
  ) {}

  @Tool({
    name: 'run_site_safety_audit',
    description:
      'End-to-end safety audit over a batch of site images (and optional worker audio): detects ' +
      'PPE violations AND real-time proximity/struck-by hazards, identifies each worker\'s ' +
      'language, and generates spoken multilingual alerts for non-critical findings. Critical ' +
      'hazards are NOT auto-alerted — the task flags them (input_required) and returns them under ' +
      'pendingApproval; call generate_voice_alert to approve and fire each one. Returns a ' +
      'regulation-cited report. Runs as a long-running MCP Task with streaming progress.',
    inputSchema: z.object({
      siteId: z.string(),
      images: z.array(z.object({
        imageUrl: z.string().url(),
        workerAudioUrl: z.string().url().optional().describe('Optional worker voice sample for language routing'),
      })).min(1),
      defaultLanguage: z.string().default('hi').describe('Fallback language if no audio sample'),
      autoAlert: z.boolean().default(true),
    }),
    // The hero: must run as a Task so it can stream progress + pause for approval.
    taskSupport: 'required',
  })
  @UseInterceptors(LoggingInterceptor)
  async runSiteSafetyAudit(
    input: { siteId: string; images: Array<{ imageUrl: string; workerAudioUrl?: string }>; defaultLanguage: string; autoAlert: boolean },
    ctx: ExecutionContext,
  ) {
    const allFindings: Array<{ type: string; severity: string; confidence: number }> = [];
    const alerts: Array<{ imageIndex: number; language: string; audioUrl: string; text: string }> = [];
    const pendingApproval: Array<{ imageIndex: number; type: string; language: string; message: string }> = [];
    let workers = 0;

    for (let i = 0; i < input.images.length; i++) {
      ctx.task?.throwIfCancelled();
      ctx.task?.updateProgress(`Analysing image ${i + 1} of ${input.images.length}…`);

      const img = input.images[i];
      const raw = await this.inference.detectPpe({ imageUrl: img.imageUrl, confidence: 0.4 });
      workers += raw.detections.filter((d) => d.class === 'Person').length;

      const { violations } = this.safety.interpret(raw);        // static PPE compliance
      const proximity = this.safety.proximityHazards(raw);       // dynamic struck-by hazards
      const found = [...violations, ...proximity];
      if (found.length === 0) continue;

      // Route to the worker's language (identify from audio, else fallback).
      let language = input.defaultLanguage;
      if (img.workerAudioUrl) {
        try {
          const l = await this.inference.identifyLanguage({ audioUrl: img.workerAudioUrl });
          if (this.lang.isSupported(l.language)) language = l.language;
        } catch { /* fall back to default language */ }
      }

      // Human-in-the-loop: flag CRITICAL hazards for supervisor approval. requestInput() only
      // sets task status/message (this SDK does not block mid-handler for a reply), so critical
      // alerts are held below rather than auto-fired — the caller must approve each one via a
      // separate generate_voice_alert call, which is the actual approval gate.
      const hasCritical = found.some((v) => v.severity === 'critical');
      if (hasCritical && ctx.task) {
        ctx.task.requestInput(
          `CRITICAL hazard on image ${i + 1} (site ${input.siteId}): ` +
          `${found.filter((v) => v.severity === 'critical').map((v) => v.type).join(', ')}. ` +
          `Held pending approval — call generate_voice_alert to confirm + send.`,
        );
      }

      for (const v of found) {
        allFindings.push({ type: v.type, severity: v.severity, confidence: v.confidence });
        IncidentStore.add({ siteId: input.siteId, ...v, imageIndex: i, language, source: 'run_site_safety_audit' });

        if (v.severity === 'critical') {
          pendingApproval.push({ imageIndex: i, type: v.type, language, message: v.message });
          continue;
        }

        if (input.autoAlert) {
          ctx.task?.updateProgress(`Generating ${this.lang.name(language)} voice alert for ${v.type}…`);
          const phrase = this.lang.cannedPhrase(v.type, language) ?? v.message;
          const tts = await this.inference.synthesizeSpeech({ text: phrase, language });
          alerts.push({ imageIndex: i, language, audioUrl: tts.audioUrl, text: phrase });
        }
      }
    }

    ctx.task?.updateProgress('Compiling regulation-cited report…');
    const critical = allFindings.filter((v) => v.severity === 'critical').length;

    return {
      siteId: input.siteId,
      imagesAnalysed: input.images.length,
      workersObserved: workers,
      totalFindings: allFindings.length,
      criticalFindings: critical,
      complianceRatePct: workers ? Math.max(0, Math.round((1 - allFindings.length / workers) * 100)) : null,
      voiceAlerts: alerts,
      pendingApproval,
      recommendation: critical > 0
        ? `${pendingApproval.length} critical hazard(s) held for approval — call generate_voice_alert to confirm + send each one.`
        : 'Site broadly compliant; continue monitoring.',
    };
  }
}
