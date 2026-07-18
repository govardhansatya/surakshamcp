// ESG RESOURCES — browsable BRSR summary + the methodology behind every metric,
// so an agent can cite HOW a number was computed, not just the number.
import { ResourceDecorator as Resource, Injectable } from '@nitrostack/core';
import { buildEsgReport } from './esg.tools.js';

const METHODOLOGY = {
  framework:
    'SEBI BRSR (Business Responsibility and Sustainability Report), Principle 3 — employee/worker well-being. ' +
    'Mandatory for India\'s top-1000 listed companies; cascading to their contractors/suppliers via BRSR Core value-chain disclosures.',
  whyItMattersForMsme:
    'Large builders now need safety data from their contractors. An MSME that can hand over a BRSR-aligned safety annexe wins bids it previously could not.',
  indicatorDefinitions: {
    'P3-EI-8': 'Percentage of workers given health & safety training in the period. Source: toolbox talks delivered via generate_toolbox_talk (sessions, languages, attendance).',
    'P3-EI-10': 'Whether a health & safety management system is implemented and its coverage. Source: SurakshaMCP continuous monitoring itself.',
    'P3-EI-11': 'LTIFR = lost-time injuries × 1,000,000 ÷ person-hours worked; plus recordable injuries, fatalities, high-consequence injuries. Source: HR/statutory registers — provided as tool inputs, never inferred.',
    'P3-EI-12': 'Measures taken for a safe workplace. Source: detected-hazard log + voice/WhatsApp alerts actually delivered + trainings.',
    'P3-EI-13': 'Complaints on working conditions. Source: requires-input (grievance register).',
  },
  dataStatusLegend: {
    measured: 'Computed directly from SurakshaMCP\'s persistent detection/training/alert database.',
    provided: 'Supplied by the caller from HR or statutory records (e.g. injury counts).',
    'requires-input': 'Not yet available — the report marks the gap instead of guessing.',
  },
  leadingVsLagging:
    'Detected PPE/proximity violations are LEADING indicators (hazards caught early). Injury metrics are LAGGING indicators. BRSR EI-11 must only contain lagging data; SurakshaMCP keeps the two strictly separate.',
  relatedRegulations: 'See suraksha://regulations/india for BOCW / Factories Act / OSHWC citations per violation type.',
};

@Injectable()
export class EsgResources {
  // Auto-computed rolling summary — the zero-effort ESG snapshot an agent can read directly.
  @Resource({
    uri: 'suraksha://esg/brsr-summary',
    name: 'brsr_safety_summary',
    description: 'Rolling 12-month BRSR Principle-3 safety summary across all sites (leading indicators, training, alerts), auto-computed from the incident database.',
    mimeType: 'application/json',
  })
  async brsrSummary() {
    const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    return { contents: buildEsgReport({ periodFrom: from }) };
  }

  // How every number is computed + what it maps to — makes the disclosure defensible.
  @Resource({
    uri: 'suraksha://esg/methodology',
    name: 'esg_methodology',
    description: 'Methodology for the BRSR Principle-3 mapping: indicator definitions, LTIFR formula, leading-vs-lagging separation, and data-status semantics.',
    mimeType: 'application/json',
  })
  async methodology() {
    return { contents: METHODOLOGY };
  }
}
