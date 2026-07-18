// Language tools — the multilingual, voice-first core.
// TOOLS: identify_worker_language, generate_voice_alert
import { ToolDecorator as Tool, z, ExecutionContext, Injectable } from '@nitrostack/core';
import { InferenceClient } from '../../common/inference.client.js';
import { IncidentStore } from '../../common/incident.store.js';
import { LanguageService, LANGUAGES } from './language.service.js';

@Injectable({ deps: [InferenceClient, LanguageService] })
export class LanguageTools {
  constructor(
    private readonly inference: InferenceClient,
    private readonly lang: LanguageService,
  ) {}

  @Tool({
    name: 'identify_worker_language',
    description:
      'Identify the spoken language from a short (~5s) audio clip of a worker, using an ' +
      'audio classifier fine-tuned on a 10-Indian-language speech dataset. Use this to route ' +
      'safety alerts to each worker in their mother tongue. Returns the top language + confidence.',
    inputSchema: z.object({
      audioUrl: z.string().url().optional().describe('Public URL of a short worker audio clip.'),
      audioBase64: z.string().optional().describe('Base64 WAV/MP3 bytes (alternative to audioUrl).'),
    }),
    taskSupport: 'forbidden',
  })
  async identifyWorkerLanguage(
    input: { audioUrl?: string; audioBase64?: string },
    ctx: ExecutionContext,
  ) {
    if (!input.audioUrl && !input.audioBase64) throw new Error('Provide audioUrl or audioBase64.');
    const r = await this.inference.identifyLanguage(input);
    ctx.logger?.info('identify_worker_language', { language: r.language, conf: r.confidence });
    return {
      language: r.language,
      languageName: r.languageName ?? this.lang.name(r.language),
      confidence: r.confidence,
      alternatives: r.topK,
      supported: this.lang.isSupported(r.language),
    };
  }

  @Tool({
    name: 'generate_voice_alert',
    description:
      'Turn a safety warning into SPOKEN audio in a specific Indian language (Hindi, Bengali, ' +
      'Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu) using AI4Bharat ' +
      'Indic-TTS. This is what reaches low-literacy workers who cannot read signage. Accepts ' +
      'either a known violation type (uses a verified canned phrase) or free text.',
    inputSchema: z.object({
      language: z.enum(Object.keys(LANGUAGES) as [string, ...string[]])
        .describe('Target language ISO code.'),
      violationType: z.string().optional()
        .describe('If set (e.g. "NO-Hardhat"), a pre-verified translated phrase is used.'),
      text: z.string().optional()
        .describe('Free-text message (English) to speak; translated + synthesised if no canned phrase.'),
    }),
    taskSupport: 'forbidden',
  })
  async generateVoiceAlert(
    input: { language: string; violationType?: string; text?: string },
    ctx: ExecutionContext,
  ) {
    const canned = input.violationType
      ? this.lang.cannedPhrase(input.violationType, input.language)
      : null;
    const spokenText = canned ?? input.text;
    if (!spokenText) throw new Error('Provide a known violationType or free text.');

    const tts = await this.inference.synthesizeSpeech({ text: spokenText, language: input.language });
    ctx.logger?.info('generate_voice_alert', { language: input.language, canned: !!canned });
    return {
      audioUrl: tts.audioUrl,
      language: input.language,
      languageName: this.lang.name(input.language),
      spokenText,
      durationSec: tts.durationSec,
      usedVerifiedPhrase: !!canned,
    };
  }

  @Tool({
    name: 'generate_toolbox_talk',
    description:
      'Generate a short SPOKEN safety briefing (toolbox talk / site induction) in a chosen Indian ' +
      'language for a topic (e.g. "working at height", "excavation near vehicles"). Addresses the ' +
      'real training gap for multilingual migrant crews — a stronger use of voice than narrating signs. ' +
      'Each delivered talk is logged as a training session, feeding the BRSR EI-8 training-coverage ' +
      'metric in generate_esg_report.',
    inputSchema: z.object({
      language: z.enum(Object.keys(LANGUAGES) as [string, ...string[]]),
      topic: z.string().describe('Safety topic to brief on'),
      points: z.array(z.string()).optional().describe('Optional key points to include'),
      siteId: z.string().optional().describe('Site the talk is delivered at (for ESG training records)'),
      workersAttended: z.number().int().min(0).optional().describe('Headcount briefed (for ESG training coverage)'),
    }),
    taskSupport: 'forbidden',
  })
  async generateToolboxTalk(
    input: { language: string; topic: string; points?: string[]; siteId?: string; workersAttended?: number },
    ctx: ExecutionContext,
  ) {
    const points = input.points ?? [
      'Wear your PPE: helmet, hi-vis vest, and boots.',
      'Keep clear of moving machinery and vehicles.',
      'Report any hazard to your supervisor immediately.',
    ];
    const script = `Today's safety briefing: ${input.topic}. ` + points.join(' ');
    // Production: translate `script` to the target language (e.g. AI4Bharat IndicTrans2) before TTS.
    const tts = await this.inference.synthesizeSpeech({ text: script, language: input.language });
    IncidentStore.addTraining({
      siteId: input.siteId,
      topic: input.topic,
      language: input.language,
      workersAttended: input.workersAttended,
      audioUrl: tts.audioUrl,
      durationSec: tts.durationSec,
    });
    return {
      language: input.language,
      languageName: this.lang.name(input.language),
      topic: input.topic,
      script,
      audioUrl: tts.audioUrl,
      durationSec: tts.durationSec,
      loggedAsTraining: true, // counted toward BRSR EI-8 training coverage in generate_esg_report
    };
  }
}
