// In-memory safety-data store. Was SQLite (better-sqlite3), but that needs a native
// node-gyp compile at install time, and NitroCloud's build image has no Python and builds
// on arm64/musl (no prebuilt binary available) — the install fails outright, and NitroCloud
// ignores project Dockerfiles so there's no way to add a toolchain to fix it there. Pure JS,
// zero native deps, works on any platform. Trade-off: data resets on restart/redeploy — but
// on a scale-to-zero-style host that wasn't a reliable guarantee with a local SQLite file
// either (ephemeral containers don't persist local disk across redeploys in general).
// Same public API as the SQLite version, so no other file needs to change.
export interface IncidentRow {
  id: number;
  ts: string;
  siteId: string;
  type: string;
  severity: string;
  confidence: number | null;
  citation: string | null;
  language: string | null;
  imageIndex: number | null;
  source: string | null;
  [key: string]: unknown; // flattened `extra` fields
}

export interface PeriodFilter {
  siteId?: string;
  since?: string; // ISO date/datetime inclusive
  until?: string; // ISO date/datetime inclusive
}

interface TrainingRow {
  id: number;
  ts: string;
  siteId: string | null;
  topic: string;
  language: string | null;
  workersAttended: number | null;
  audioUrl: string | null;
  durationSec: number | null;
}

interface AlertRow {
  id: number;
  ts: string;
  siteId: string | null;
  channel: string;
  toMasked: string | null;
  language: string | null;
  message: string | null;
  status: string | null;
}

let nextIncidentId = 1;
let nextTrainingId = 1;
let nextAlertId = 1;
const incidents: IncidentRow[] = [];
const trainings: TrainingRow[] = [];
const alerts: AlertRow[] = [];
const channelConfigs = new Map<string, Record<string, unknown>>();

function matchesFilter(f: PeriodFilter, siteId: string | null, ts: string): boolean {
  if (f.siteId && siteId !== f.siteId) return false;
  if (f.since && ts < f.since) return false;
  if (f.until && ts > f.until) return false;
  return true;
}

function countBy<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function sortByTsDescIdDesc<T extends { ts: string; id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.ts === a.ts ? b.id - a.id : b.ts.localeCompare(a.ts)));
}

export const IncidentStore = {
  add(row: Record<string, unknown>) {
    const { siteId, type, severity, confidence, citation, language, imageIndex, source, ...rest } =
      row as Record<string, unknown> & { siteId?: string; type?: string };
    incidents.push({
      id: nextIncidentId++,
      ts: new Date().toISOString(),
      siteId: String(siteId ?? 'unknown'),
      type: String(type ?? 'unknown'),
      severity: String(row.severity ?? severity ?? 'medium'),
      confidence: typeof confidence === 'number' ? confidence : null,
      citation: citation != null ? String(citation) : null,
      language: language != null ? String(language) : null,
      imageIndex: typeof imageIndex === 'number' ? imageIndex : null,
      source: source != null ? String(source) : null,
      ...rest,
    });
  },

  all(limit = 200): IncidentRow[] {
    return sortByTsDescIdDesc(incidents).slice(0, limit);
  },

  query(f: PeriodFilter & { limit?: number } = {}): IncidentRow[] {
    const filtered = incidents.filter((r) => matchesFilter(f, r.siteId, r.ts));
    return sortByTsDescIdDesc(filtered).slice(0, f.limit ?? 500);
  },

  // Aggregates powering generate_esg_report + the BRSR summary resource.
  stats(f: PeriodFilter = {}) {
    const filtered = incidents.filter((r) => matchesFilter(f, r.siteId, r.ts));
    const bySeverity = countBy(filtered, (r) => r.severity);
    const byType = countBy(filtered, (r) => r.type);
    const bySite = countBy(filtered, (r) => r.siteId);

    const monthlyMap = new Map<string, { total: number; critical: number }>();
    for (const r of filtered) {
      const month = r.ts.slice(0, 7);
      const entry = monthlyMap.get(month) ?? { total: 0, critical: 0 };
      entry.total += 1;
      if (r.severity === 'critical') entry.critical += 1;
      monthlyMap.set(month, entry);
    }
    const monthlyTrend = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    return {
      totalViolations: filtered.length,
      bySeverity,
      byType,
      bySite,
      monthlyTrend,
    };
  },

  addTraining(t: { siteId?: string; topic: string; language?: string; workersAttended?: number; audioUrl?: string; durationSec?: number }) {
    trainings.push({
      id: nextTrainingId++,
      ts: new Date().toISOString(),
      siteId: t.siteId ?? null,
      topic: t.topic,
      language: t.language ?? null,
      workersAttended: t.workersAttended ?? null,
      audioUrl: t.audioUrl ?? null,
      durationSec: t.durationSec ?? null,
    });
  },

  trainingStats(f: PeriodFilter = {}) {
    const filtered = trainings.filter((r) => matchesFilter(f, r.siteId, r.ts));
    const sessionsDelivered = filtered.length;
    const workersTrained = filtered.reduce((sum, r) => sum + (r.workersAttended ?? 0), 0);
    const byLanguage = countBy(filtered, (r) => r.language ?? 'unknown');

    const topicCounts = new Map<string, number>();
    for (const r of filtered) topicCounts.set(r.topic, (topicCounts.get(r.topic) ?? 0) + 1);
    const topics = [...topicCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([topic, sessions]) => ({ topic, sessions }));

    return { sessionsDelivered, workersTrained, byLanguage, topics };
  },

  addAlert(a: { siteId?: string; channel: string; to?: string; language?: string; message?: string; status?: string }) {
    // Never persist a full phone number — keep the last 4 digits for traceability only.
    const masked = a.to ? `…${a.to.replace(/\D/g, '').slice(-4)}` : null;
    alerts.push({
      id: nextAlertId++,
      ts: new Date().toISOString(),
      siteId: a.siteId ?? null,
      channel: a.channel,
      toMasked: masked,
      language: a.language ?? null,
      message: a.message ?? null,
      status: a.status ?? null,
    });
  },

  // Store a site's own channel credentials (e.g. their Twilio account), overriding the
  // server-wide env-var defaults for that site only.
  setChannelConfig(siteId: string, channel: string, config: Record<string, unknown>) {
    channelConfigs.set(`${siteId}:${channel}`, config);
  },

  getChannelConfig(siteId: string, channel: string): Record<string, unknown> | null {
    return channelConfigs.get(`${siteId}:${channel}`) ?? null;
  },

  alertStats(f: PeriodFilter = {}) {
    const filtered = alerts.filter((r) => matchesFilter(f, r.siteId, r.ts));
    const byChannel = countBy(filtered, (r) => r.channel);
    const byLanguage = countBy(filtered, (r) => r.language ?? 'unknown');
    return { alertsDelivered: filtered.length, byChannel, byLanguage };
  },
};
