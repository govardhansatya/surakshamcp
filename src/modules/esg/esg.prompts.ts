// PROMPT — guides any host's agent through drafting a defensible BRSR Principle-3 section.
import { PromptDecorator as Prompt, Injectable } from '@nitrostack/core';

@Injectable()
export class EsgPrompts {
  @Prompt({
    name: 'esg_disclosure_brief',
    description: 'Template for drafting the BRSR Principle 3 (worker safety) disclosure section from SurakshaMCP data, with honest gaps flagged.',
    arguments: [
      { name: 'period', description: 'Reporting period, e.g. "2026-04-01 to 2026-06-30" or "FY 2025-26"', required: true },
      { name: 'siteId', description: 'Optional site identifier; omit for all sites', required: false },
      { name: 'companyName', description: 'Contractor/company name for the disclosure header', required: false },
    ],
  })
  async disclosureBrief(args: { period: string; siteId?: string; companyName?: string }) {
    const scope = args.siteId ? `site ${args.siteId}` : 'all sites';
    return {
      messages: [
        {
          role: 'user',
          content:
            `Draft the BRSR Principle 3 (occupational health & safety) disclosure section` +
            (args.companyName ? ` for ${args.companyName}` : '') +
            ` covering ${scope}, period ${args.period}.\n` +
            `1. Call generate_esg_report with periodFrom/periodTo matching the period (ask the user for ` +
            `totalWorkers, manHoursWorked and injury counts from HR records if not provided — never invent them).\n` +
            `2. Read suraksha://esg/methodology and follow its leading-vs-lagging separation strictly.\n` +
            `3. Read suraksha://regulations/india to cite the clauses behind top violation types.\n` +
            `4. Produce the disclosure with one subsection per BRSR indicator (EI-8, EI-10, EI-11, EI-12, EI-13): ` +
            `state the value, its dataStatus, and for every requires-input field write "[TO BE PROVIDED FROM ` +
            `STATUTORY REGISTERS]" rather than a number.\n` +
            `5. Close with the violation trend, top corrective actions, and next-quarter training plan.\n` +
            `Write for a compliance officer submitting to a BRSR-reporting client; keep it audit-ready and dated.`,
        },
      ],
    };
  }
}
