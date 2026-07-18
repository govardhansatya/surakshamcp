// Persistent safety-data store — better-sqlite3 (file-backed, zero-ops, survives restarts).
// Replaces the old in-memory array so incidents/trainings/alerts accumulate across sessions,
// which is what makes the ESG/BRSR trend metrics credible.
// DB path: SURAKSHA_DB_PATH (default ./data/suraksha.db). Use ':memory:' in tests.
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
  [key: string]: unknown; // flattened `extra` JSON
}

export interface PeriodFilter {
  siteId?: string;
  since?: string; // ISO date/datetime inclusive
  until?: string; // ISO date/datetime inclusive
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.SURAKSHA_DB_PATH ?? path.join(process.cwd(), 'data', 'suraksha.db');
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      site_id TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      confidence REAL,
      citation TEXT,
      language TEXT,
      image_index INTEGER,
      source TEXT,
      extra TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_site_ts ON incidents(site_id, ts);
    CREATE INDEX IF NOT EXISTS idx_incidents_ts ON incidents(ts);

    CREATE TABLE IF NOT EXISTS trainings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      site_id TEXT,
      topic TEXT NOT NULL,
      language TEXT,
      workers_attended INTEGER,
      audio_url TEXT,
      duration_sec REAL
    );
    CREATE INDEX IF NOT EXISTS idx_trainings_ts ON trainings(ts);

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      site_id TEXT,
      channel TEXT NOT NULL,
      to_masked TEXT,
      language TEXT,
      message TEXT,
      status TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);

    -- Per-site notification-channel credentials, set once via configure_alert_channel so a
    -- contractor can bring their own Twilio account without editing server env vars. This is
    -- a demo-appropriate store (plaintext at rest, same trust boundary as the rest of this
    -- SQLite file) — a production deployment should use a real secrets manager instead.
    CREATE TABLE IF NOT EXISTS channel_configs (
      site_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      config TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, channel)
    );
  `);
  process.once('exit', () => { try { _db?.close(); } catch { /* already closed */ } });
  return _db;
}

function periodWhere(f: PeriodFilter, siteCol = 'site_id'): { clause: string; params: Record<string, string> } {
  const conds: string[] = [];
  const params: Record<string, string> = {};
  if (f.siteId) { conds.push(`${siteCol} = @siteId`); params.siteId = f.siteId; }
  if (f.since) { conds.push('ts >= @since'); params.since = f.since; }
  if (f.until) { conds.push('ts <= @until'); params.until = f.until; }
  return { clause: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

function rowToIncident(r: Record<string, unknown>): IncidentRow {
  const extra = r.extra ? JSON.parse(r.extra as string) : {};
  return {
    id: r.id as number,
    ts: r.ts as string,
    siteId: r.site_id as string,
    type: r.type as string,
    severity: r.severity as string,
    confidence: r.confidence as number | null,
    citation: r.citation as string | null,
    language: r.language as string | null,
    imageIndex: r.image_index as number | null,
    source: r.source as string | null,
    ...extra,
  };
}

// Same call surface the old in-memory store had (add/all), plus the query/stats
// methods the ESG module needs. Known fields map to columns; anything else lands in `extra`.
export const IncidentStore = {
  add(row: Record<string, unknown>) {
    const { siteId, type, severity, confidence, citation, language, imageIndex, source, ...rest } =
      row as Record<string, unknown> & { siteId?: string; type?: string };
    getDb().prepare(`
      INSERT INTO incidents (ts, site_id, type, severity, confidence, citation, language, image_index, source, extra)
      VALUES (@ts, @siteId, @type, @severity, @confidence, @citation, @language, @imageIndex, @source, @extra)
    `).run({
      ts: new Date().toISOString(),
      siteId: String(siteId ?? 'unknown'),
      type: String(type ?? 'unknown'),
      severity: String(row.severity ?? 'medium'),
      confidence: typeof confidence === 'number' ? confidence : null,
      citation: citation != null ? String(citation) : null,
      language: language != null ? String(language) : null,
      imageIndex: typeof imageIndex === 'number' ? imageIndex : null,
      source: source != null ? String(source) : null,
      extra: Object.keys(rest).length ? JSON.stringify(rest) : null,
    });
  },

  all(limit = 200): IncidentRow[] {
    return getDb().prepare('SELECT * FROM incidents ORDER BY ts DESC, id DESC LIMIT ?')
      .all(limit).map((r) => rowToIncident(r as Record<string, unknown>));
  },

  query(f: PeriodFilter & { limit?: number } = {}): IncidentRow[] {
    const { clause, params } = periodWhere(f);
    return getDb().prepare(`SELECT * FROM incidents ${clause} ORDER BY ts DESC, id DESC LIMIT @limit`)
      .all({ ...params, limit: f.limit ?? 500 }).map((r) => rowToIncident(r as Record<string, unknown>));
  },

  // Aggregates powering generate_esg_report + the BRSR summary resource.
  stats(f: PeriodFilter = {}) {
    const db = getDb();
    const { clause, params } = periodWhere(f);
    const total = (db.prepare(`SELECT COUNT(*) c FROM incidents ${clause}`).get(params) as { c: number }).c;
    const bySeverity = db.prepare(
      `SELECT severity, COUNT(*) c FROM incidents ${clause} GROUP BY severity ORDER BY c DESC`,
    ).all(params) as Array<{ severity: string; c: number }>;
    const byType = db.prepare(
      `SELECT type, COUNT(*) c FROM incidents ${clause} GROUP BY type ORDER BY c DESC`,
    ).all(params) as Array<{ type: string; c: number }>;
    const bySite = db.prepare(
      `SELECT site_id, COUNT(*) c FROM incidents ${clause} GROUP BY site_id ORDER BY c DESC`,
    ).all(params) as Array<{ site_id: string; c: number }>;
    const monthly = db.prepare(
      `SELECT substr(ts, 1, 7) month, COUNT(*) total,
              SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) critical
       FROM incidents ${clause} GROUP BY month ORDER BY month`,
    ).all(params) as Array<{ month: string; total: number; critical: number }>;
    return {
      totalViolations: total,
      bySeverity: Object.fromEntries(bySeverity.map((r) => [r.severity, r.c])),
      byType: Object.fromEntries(byType.map((r) => [r.type, r.c])),
      bySite: Object.fromEntries(bySite.map((r) => [r.site_id, r.c])),
      monthlyTrend: monthly,
    };
  },

  addTraining(t: { siteId?: string; topic: string; language?: string; workersAttended?: number; audioUrl?: string; durationSec?: number }) {
    getDb().prepare(`
      INSERT INTO trainings (ts, site_id, topic, language, workers_attended, audio_url, duration_sec)
      VALUES (@ts, @siteId, @topic, @language, @workersAttended, @audioUrl, @durationSec)
    `).run({
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
    const db = getDb();
    const { clause, params } = periodWhere(f);
    const agg = db.prepare(
      `SELECT COUNT(*) sessions, COALESCE(SUM(workers_attended), 0) workers FROM trainings ${clause}`,
    ).get(params) as { sessions: number; workers: number };
    const byLanguage = db.prepare(
      `SELECT language, COUNT(*) c FROM trainings ${clause} GROUP BY language ORDER BY c DESC`,
    ).all(params) as Array<{ language: string | null; c: number }>;
    const topics = db.prepare(
      `SELECT topic, COUNT(*) c FROM trainings ${clause} GROUP BY topic ORDER BY c DESC LIMIT 20`,
    ).all(params) as Array<{ topic: string; c: number }>;
    return {
      sessionsDelivered: agg.sessions,
      workersTrained: agg.workers,
      byLanguage: Object.fromEntries(byLanguage.map((r) => [r.language ?? 'unknown', r.c])),
      topics: topics.map((t) => ({ topic: t.topic, sessions: t.c })),
    };
  },

  addAlert(a: { siteId?: string; channel: string; to?: string; language?: string; message?: string; status?: string }) {
    // Never persist a full phone number — keep the last 4 digits for traceability only.
    const masked = a.to ? `…${a.to.replace(/\D/g, '').slice(-4)}` : null;
    getDb().prepare(`
      INSERT INTO alerts (ts, site_id, channel, to_masked, language, message, status)
      VALUES (@ts, @siteId, @channel, @toMasked, @language, @message, @status)
    `).run({
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
    getDb().prepare(`
      INSERT INTO channel_configs (site_id, channel, config, updated_at)
      VALUES (@siteId, @channel, @config, @updatedAt)
      ON CONFLICT(site_id, channel) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at
    `).run({
      siteId,
      channel,
      config: JSON.stringify(config),
      updatedAt: new Date().toISOString(),
    });
  },

  getChannelConfig(siteId: string, channel: string): Record<string, unknown> | null {
    const row = getDb().prepare(
      'SELECT config FROM channel_configs WHERE site_id = ? AND channel = ?',
    ).get(siteId, channel) as { config: string } | undefined;
    return row ? JSON.parse(row.config) : null;
  },

  alertStats(f: PeriodFilter = {}) {
    const db = getDb();
    const { clause, params } = periodWhere(f);
    const total = (db.prepare(`SELECT COUNT(*) c FROM alerts ${clause}`).get(params) as { c: number }).c;
    const byChannel = db.prepare(
      `SELECT channel, COUNT(*) c FROM alerts ${clause} GROUP BY channel`,
    ).all(params) as Array<{ channel: string; c: number }>;
    const byLanguage = db.prepare(
      `SELECT language, COUNT(*) c FROM alerts ${clause} GROUP BY language ORDER BY c DESC`,
    ).all(params) as Array<{ language: string | null; c: number }>;
    return {
      alertsDelivered: total,
      byChannel: Object.fromEntries(byChannel.map((r) => [r.channel, r.c])),
      byLanguage: Object.fromEntries(byLanguage.map((r) => [r.language ?? 'unknown', r.c])),
    };
  },
};
