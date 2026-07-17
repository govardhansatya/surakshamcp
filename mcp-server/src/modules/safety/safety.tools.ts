// Safety tools — the vision entry point of the server.
// TOOL: detect_ppe_violations
import { ToolDecorator as Tool, z, ExecutionContext, Injectable } from '@nitrostack/core';
import { InferenceClient } from '../../common/inference.client.js';
import { SafetyService } from './safety.service.js';

@Injectable({ deps: [InferenceClient, SafetyService] })
export class SafetyTools {
  constructor(
    private readonly inference: InferenceClient,
    private readonly safety: SafetyService,
  ) {}

  @Tool({
    name: 'detect_ppe_violations',
    description:
      'Analyse a construction-site image (photo or CCTV frame) and detect PPE / hazard ' +
      'violations using a YOLOv8 model fine-tuned on the Roboflow Construction Site Safety ' +
      'dataset (classes: Hardhat, Mask, Safety Vest and their NO- variants, Person, Safety ' +
      'Cone, machinery, vehicle). Returns structured violations with severity so an agent ' +
      'can decide whether to alert, escalate, or log.',
    inputSchema: z.object({
      imageUrl: z.string().url().optional().describe('Public URL of the site image.'),
      imageBase64: z.string().optional().describe('Base64 image bytes (alternative to imageUrl).'),
      confidence: z.number().min(0).max(1).default(0.4)
        .describe('Minimum detection confidence.'),
    }),
    // Fast, deterministic call — safe to run synchronously.
    taskSupport: 'forbidden',
  })
  async detectPpeViolations(
    input: { imageUrl?: string; imageBase64?: string; confidence?: number },
    ctx: ExecutionContext,
  ) {
    if (!input.imageUrl && !input.imageBase64) {
      throw new Error('Provide either imageUrl or imageBase64.');
    }
    ctx.logger?.info('detect_ppe_violations', { hasUrl: !!input.imageUrl });

    const raw = await this.inference.detectPpe(input);
    const { violations, summary } = this.safety.interpret(raw);

    return {
      compliant: violations.length === 0,
      summary,
      violations,
      rawDetections: raw.detections,
      // Hint to the calling agent about the natural next step (agentic composability).
      nextStep:
        violations.length > 0
          ? 'Call identify_worker_language on a worker audio sample, then generate_voice_alert.'
          : 'No action needed; optionally log a compliant observation.',
    };
  }

  @Tool({
    name: 'detect_proximity_hazards',
    description:
      'Detect real-time struck-by / run-over hazards — a worker dangerously close to moving ' +
      'machinery or a vehicle — from a site image. This is the DYNAMIC-hazard case where an ' +
      'immediate spoken warning in the worker\'s language can prevent an incident (cf. EMESRT L7 ' +
      'audible-alert collision-avoidance). Vision-based and low-cost; complements UWB tag systems.',
    inputSchema: z.object({
      imageUrl: z.string().url().optional(),
      imageBase64: z.string().optional(),
      confidence: z.number().min(0).max(1).default(0.4),
    }),
    taskSupport: 'forbidden',
  })
  async detectProximityHazards(
    input: { imageUrl?: string; imageBase64?: string; confidence?: number },
    ctx: ExecutionContext,
  ) {
    if (!input.imageUrl && !input.imageBase64) throw new Error('Provide imageUrl or imageBase64.');
    const raw = await this.inference.detectPpe(input);
    const hazards = this.safety.proximityHazards(raw);
    ctx.logger?.info('detect_proximity_hazards', { count: hazards.length });
    return {
      hazardCount: hazards.length,
      hazards,
      urgent: hazards.some((h) => h.severity === 'critical'),
      nextStep:
        hazards.length > 0
          ? 'Immediately call generate_voice_alert in the worker\'s language and escalate to the supervisor.'
          : 'No proximity hazard detected.',
    };
  }
}
