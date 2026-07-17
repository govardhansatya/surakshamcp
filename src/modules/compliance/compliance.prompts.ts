// PROMPTS — reusable, parameterised templates hosts/agents can invoke.
// NOTE: verify decorator import + return shape against https://docs.nitrostack.ai (Prompts guide).
import { PromptDecorator as Prompt, Injectable } from '@nitrostack/core';

@Injectable()
export class CompliancePrompts {
  // Guides an agent through a structured safety investigation using this server's tools.
  @Prompt({
    name: 'safety_investigation_playbook',
    description: 'Step-by-step playbook for investigating recurring PPE violations on a site.',
    arguments: [
      { name: 'siteId', description: 'Site identifier', required: true },
      { name: 'period', description: 'Time window, e.g. "last 7 days"', required: true },
    ],
  })
  async investigationPlaybook(args: { siteId: string; period: string }) {
    return {
      messages: [
        {
          role: 'user',
          content:
            `You are a construction-safety investigator for site ${args.siteId} over ${args.period}.\n` +
            `1. Call detect_ppe_violations on the provided site images.\n` +
            `2. For each violating worker, call identify_worker_language, then generate_voice_alert.\n` +
            `3. Read suraksha://regulations/india and cite the exact clause for each violation.\n` +
            `4. Read suraksha://incidents/recent to spot repeat offenders / hotspots.\n` +
            `5. Call generate_safety_report and recommend corrective actions.\n` +
            `Be specific, cite regulations, and prioritise critical (head/height) hazards first.`,
        },
      ],
    };
  }

  // Turns aggregated findings into a management-ready ESG/compliance report.
  @Prompt({
    name: 'compliance_report_brief',
    description: 'Template that renders detected violations into a Factories Act / BOCW-aligned report.',
    arguments: [
      { name: 'siteId', description: 'Site identifier', required: true },
      { name: 'period', description: 'Time window, e.g. "last 7 days"', required: true },
    ],
  })
  async reportBrief(args: { siteId: string; period: string }) {
    return {
      messages: [
        {
          role: 'user',
          content:
            `Produce a compliance report for site ${args.siteId} (${args.period}). Include: ` +
            `overall PPE compliance rate, violations by type and severity, repeat hotspots, ` +
            `regulation citations (BOCW/Factories Act/OSHWC), and prioritised corrective actions. ` +
            `Write for a site manager; keep it audit-ready and time-stamped.`,
        },
      ],
    };
  }
}
