// TOOL: generate_esg_report — turns the persistent incident/training/alert data into a
// BRSR Principle 3 (SEBI ESG disclosure) aligned safety report.
//
// Honest-data framing: what SurakshaMCP measures itself (detected violations, trainings
// delivered, alerts sent) are LEADING indicators; injury data (LTIFR, recordables,
// fatalities) are LAGGING indicators that must come from HR/site records and are accepted
// as inputs — each mapped field is labelled 'measured' | 'provided' | 'requires-input'.
import { ToolDecorator as Tool, z, ExecutionContext, Injectable } from '@nitrostack/core';
import { IncidentStore } from '../../common/incident.store.js';

// Normalise date-only bounds so 'until 2026-07-18' includes that whole day.
export function normalisePeriod(from?: string, to?: string): { since: string; until: string } {
  const since = from
    ? (from.length === 10 ? `${from}T00:00:00.000Z` : from)
    : new Date(Date.now() - 90 * 86_400_000).toISOString();
  const until = to
    ? (to.length === 10 ? `${to}T23:59:59.999Z` : to)
    : new Date().toISOString();
  return { since, until };
}

export interface EsgReportInput {
  siteId?: string;
  periodFrom?: string;
  periodTo?: string;
  totalWorkers?: number;
  manHoursWorked?: number;
  lostTimeInjuries?: number;
  recordableInjuries?: number;
  fatalities?: number;
  highConsequenceInjuries?: number;
}

// Pure aggregation over the store — exported separately so it can be unit-tested
// and reused by the auto-computed suraksha://esg/brsr-summary resource.
export function buildEsgReport(input: EsgReportInput) {
  const { since, until } = normalisePeriod(input.periodFrom, input.periodTo);
  const filter = { siteId: input.siteId, since, until };

  const incidents = IncidentStore.stats(filter);
  const training = IncidentStore.trainingStats(filter);
  const alerts = IncidentStore.alertStats(filter);

  const ltifr =
    input.lostTimeInjuries != null && input.manHoursWorked
      ? Math.round((input.lostTimeInjuries * 1_000_000 / input.manHoursWorked) * 100) / 100
      : null;
  const trainingCoveragePct =
    input.totalWorkers && training.workersTrained
      ? Math.min(100, Math.round((training.workersTrained / input.totalWorkers) * 100))
      : null;

  const trend = incidents.monthlyTrend;
  const trendDirection =
    trend.length >= 2
      ? (trend[trend.length - 1].total < trend[trend.length - 2].total ? 'improving' : 'worsening')
      : 'insufficient-history';

  const status = (v: unknown, provided: boolean) =>
    v == null ? 'requires-input' : provided ? 'provided' : 'measured';

  return {
    reportType: 'BRSR Principle 3 — Safety Disclosure (SEBI Business Responsibility & Sustainability Report)',
    scope: input.siteId ?? 'all-sites',
    period: { from: since, to: until },
    generatedAt: new Date().toISOString(),

    // Measured by SurakshaMCP (leading indicators — hazards caught before they become injuries).
    leadingIndicators: {
      ...incidents,
      criticalViolations: incidents.bySeverity['critical'] ?? 0,
      trendDirection,
    },

    // From HR/site records (lagging indicators) — supplied as tool inputs.
    laggingIndicators: {
      ltifrPerMillionHours: ltifr,
      lostTimeInjuries: input.lostTimeInjuries ?? null,
      recordableInjuries: input.recordableInjuries ?? null,
      fatalities: input.fatalities ?? null,
      highConsequenceInjuries: input.highConsequenceInjuries ?? null,
      manHoursWorked: input.manHoursWorked ?? null,
      note: ltifr == null
        ? 'LTIFR needs lostTimeInjuries + manHoursWorked from site/HR records — pass them as inputs.'
        : 'LTIFR = lost-time injuries × 1,000,000 ÷ person-hours worked (BRSR EI-11 formula).',
    },

    training: { ...training, totalWorkers: input.totalWorkers ?? null, coveragePct: trainingCoveragePct },
    measuresTaken: alerts, // spoken/WhatsApp alerts actually delivered to workers

    // Field-by-field mapping to the BRSR Principle 3 Essential Indicators.
    brsrP3Mapping: [
      {
        indicator: 'P3-EI-8',
        question: '% of employees/workers given health & safety training',
        value: trainingCoveragePct != null ? `${trainingCoveragePct}%` : `${training.workersTrained} workers trained (${training.sessionsDelivered} multilingual toolbox talks)`,
        dataStatus: status(trainingCoveragePct ?? (training.workersTrained || null), false),
      },
      {
        indicator: 'P3-EI-10',
        question: 'Health & safety management system implemented?',
        value: 'Yes — continuous AI monitoring (PPE + proximity), multilingual voice alerting, regulation-cited incident log (SurakshaMCP)',
        dataStatus: 'measured',
      },
      {
        indicator: 'P3-EI-11',
        question: 'Safety incidents: LTIFR, recordable injuries, fatalities, high-consequence injuries',
        value: ltifr != null ? `LTIFR ${ltifr} per million person-hours` : null,
        dataStatus: status(ltifr, true),
      },
      {
        indicator: 'P3-EI-12',
        question: 'Measures taken to ensure a safe and healthy workplace',
        value: `${incidents.totalViolations} hazard(s) detected & logged; ${alerts.alertsDelivered} worker alert(s) delivered; ${training.sessionsDelivered} toolbox talk(s) in ${Object.keys(training.byLanguage).length} language(s)`,
        dataStatus: 'measured',
      },
      {
        indicator: 'P3-EI-13',
        question: 'Complaints on working conditions / health & safety',
        value: null,
        dataStatus: 'requires-input',
      },
    ],

    caveats: [
      'Detected violations are leading indicators (hazards observed), not injury records; do not report them as BRSR EI-11 injuries.',
      'workersTrained sums session attendance and may double-count individuals across sessions.',
      'Lagging indicators (injuries, fatalities, complaints) must be sourced from statutory registers (BOCW/Factories Act) and passed as inputs.',
    ],
  };
}

@Injectable()
export class EsgTools {
  @Tool({
    name: 'generate_esg_report',
    description:
      'Generate a BRSR Principle 3 (SEBI ESG disclosure) aligned safety report from the persistent ' +
      'incident/training/alert database: leading indicators (detected violations, trend), training ' +
      'coverage, measures taken, plus LTIFR and other lagging indicators when HR data is supplied. ' +
      'Each BRSR field is labelled measured / provided / requires-input. Use this to help an MSME ' +
      'contractor evidence safety compliance to BRSR-reporting clients.',
    inputSchema: z.object({
      siteId: z.string().optional().describe('Limit to one site; omit for all sites'),
      periodFrom: z.string().optional().describe('ISO date (YYYY-MM-DD) start of reporting period; default 90 days ago'),
      periodTo: z.string().optional().describe('ISO date (YYYY-MM-DD) end of reporting period; default today'),
      totalWorkers: z.number().int().positive().optional().describe('Workforce size — enables training-coverage %'),
      manHoursWorked: z.number().positive().optional().describe('Person-hours worked in period — enables LTIFR'),
      lostTimeInjuries: z.number().int().min(0).optional().describe('Lost-time injuries in period (HR records)'),
      recordableInjuries: z.number().int().min(0).optional().describe('Total recordable work-related injuries (HR records)'),
      fatalities: z.number().int().min(0).optional().describe('Fatalities in period (HR records)'),
      highConsequenceInjuries: z.number().int().min(0).optional().describe('High-consequence injuries excl. fatalities (HR records)'),
    }),
    taskSupport: 'forbidden',
  })
  async generateEsgReport(input: EsgReportInput, ctx: ExecutionContext) {
    const report = buildEsgReport(input);
    ctx.logger?.info('generate_esg_report', {
      scope: report.scope,
      violations: report.leadingIndicators.totalViolations,
      ltifr: report.laggingIndicators.ltifrPerMillionHours,
    });
    return report;
  }
}
