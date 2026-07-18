// RESOURCES — read-only structured data any agent/host can browse.
// NOTE: verify the exact decorator import name + return shape against
// https://docs.nitrostack.ai (Resources guide). Pattern mirrors the Tool decorator.
import { ResourceDecorator as Resource, Injectable } from '@nitrostack/core';
import { IncidentStore } from '../../common/incident.store.js';

// Minimal, citable Indian construction-safety regulation map (extend from official texts).
const REGULATIONS = {
  'NO-Hardhat': [
    { code: 'BOCW Central Rules 1998, Rule 36', text: 'Employer shall provide and ensure use of safety helmets.' },
    { code: 'IS 3764 / IS 2925', text: 'Standard for industrial safety helmets.' },
    { code: 'Factories Act 1948, s.7A', text: 'General duty to ensure worker safety incl. PPE.' },
  ],
  'NO-Safety Vest': [
    { code: 'BOCW Central Rules 1998, Rule 36', text: 'High-visibility clothing near vehicular movement.' },
    { code: 'OSHWC Code 2020', text: 'Documented safety systems for establishments with 10+ workers.' },
  ],
  'NO-Mask': [
    { code: 'Factories Act 1948, s.36', text: 'Protection against dust and fumes.' },
  ],
};

@Injectable()
export class ComplianceResources {
  // Browsable regulation reference — agents read this to cite the right clause in a report.
  @Resource({
    uri: 'suraksha://regulations/india',
    name: 'india_safety_regulations',
    description: 'Indian construction-safety regulations (BOCW, Factories Act, OSHWC Code, IS codes) keyed by violation type.',
    mimeType: 'application/json',
  })
  async regulations() {
    return { contents: REGULATIONS, source: 'BOCW Act 1996 & Central Rules 1998; Factories Act 1948; OSHWC Code 2020; BIS standards.' };
  }

  // Incident log resource — backed by the persistent SQLite store (survives restarts,
  // powers the ESG/BRSR trend metrics).
  @Resource({
    uri: 'suraksha://incidents/recent',
    name: 'recent_incidents',
    description: 'Recent detected safety incidents (site, timestamp, violation, severity, action taken).',
    mimeType: 'application/json',
  })
  async recentIncidents() {
    return { contents: IncidentStore.all() };
  }
}

// Re-exported so existing importers keep working after the SQLite migration.
export { IncidentStore } from '../../common/incident.store.js';
