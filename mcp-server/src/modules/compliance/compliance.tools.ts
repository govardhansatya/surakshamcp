// TOOL: generate_safety_report — aggregates violations into a regulation-cited summary.
import { ToolDecorator as Tool, z, ExecutionContext, Injectable } from '@nitrostack/core';
import { IncidentStore } from './compliance.resources.js';

const REG_CITATION: Record<string, string> = {
  'NO-Hardhat': 'BOCW Central Rules 1998 Rule 36; Factories Act 1948 s.7A; IS 2925.',
  'NO-Safety Vest': 'BOCW Central Rules 1998 Rule 36; OSHWC Code 2020.',
  'NO-Mask': 'Factories Act 1948 s.36.',
};

@Injectable()
export class ComplianceTools {
  @Tool({
    name: 'generate_safety_report',
    description:
      'Aggregate a set of detected violations into an audit-ready, regulation-cited safety report ' +
      '(compliance rate, breakdown by type/severity, cited clauses, corrective actions). Also ' +
      'appends each violation to the incident log resource.',
    inputSchema: z.object({
      siteId: z.string().describe('Site identifier'),
      violations: z.array(z.object({
        type: z.string(),
        severity: z.enum(['critical', 'high', 'medium']),
        confidence: z.number(),
      })).describe('Violations gathered from detect_ppe_violations'),
      workersObserved: z.number().int().min(0).default(0),
    }),
    taskSupport: 'forbidden',
  })
  async generateSafetyReport(
    input: { siteId: string; violations: Array<{ type: string; severity: string; confidence: number }>; workersObserved: number },
    ctx: ExecutionContext,
  ) {
    const byType: Record<string, number> = {};
    for (const v of input.violations) {
      byType[v.type] = (byType[v.type] ?? 0) + 1;
      IncidentStore.add({ siteId: input.siteId, ...v, citation: REG_CITATION[v.type] });
    }
    const critical = input.violations.filter((v) => v.severity === 'critical').length;
    const complianceRate = input.workersObserved
      ? Math.max(0, Math.round((1 - input.violations.length / input.workersObserved) * 100))
      : null;

    return {
      siteId: input.siteId,
      generatedAt: new Date().toISOString(),
      workersObserved: input.workersObserved,
      totalViolations: input.violations.length,
      criticalViolations: critical,
      complianceRatePct: complianceRate,
      breakdown: Object.entries(byType).map(([type, count]) => ({
        type, count, citation: REG_CITATION[type] ?? 'See suraksha://regulations/india',
      })),
      correctiveActions: critical > 0
        ? ['Stop-work for critical head/height hazards', 'Issue voice alerts in worker languages', 'Toolbox talk before next shift']
        : ['Continue monitoring', 'Log compliant observation'],
    };
  }
}
