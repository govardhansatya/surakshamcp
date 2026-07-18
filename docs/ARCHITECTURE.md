# SurakshaMCP — Architecture (quick reference)

The **full blueprint** (problem, competitive analysis, business model, timeline, demo
script, rubric map) lives in the thread's blueprint document. This file is the
engineering quick-reference.

## MCP surface (what agents see)

**Tools**
| Tool | Module | Purpose | Task? |
|---|---|---|---|
| `detect_ppe_violations` | safety | YOLOv8 PPE/hazard detection from an image | no |
| `detect_proximity_hazards` | safety | real-time struck-by/run-over (person near machinery/vehicle) | no |
| `identify_worker_language` | language | spoken-language ID from a ~5s clip | no |
| `generate_voice_alert` | language | spoken alert (Indic-TTS) in a chosen language | no |
| `generate_toolbox_talk` | language | multilingual safety briefing / site induction (logged as ESG training) | no |
| `generate_safety_report` | compliance | regulation-cited report + incident logging | no |
| `generate_esg_report` | esg | BRSR Principle-3 (SEBI ESG) safety disclosure from the incident DB | no |
| `send_whatsapp_alert` | notify | WhatsApp text + voice-note alert via Twilio (dry-run without creds; rate-limited) | no |
| `run_site_safety_audit` | workflows | **hero** end-to-end audit | **required (long-running Task)** |
| `health_check` | infra | server + backend readiness | no |

**Resources**
- `suraksha://regulations/india` — BOCW / Factories Act / OSHWC / IS clauses by violation type
- `suraksha://incidents/recent` — recent detected incidents
- `suraksha://esg/brsr-summary` — rolling 12-month BRSR Principle-3 safety summary (auto-computed)
- `suraksha://esg/methodology` — how every ESG metric is computed (LTIFR formula, leading vs lagging)

**Prompts**
- `safety_investigation_playbook` — guided multi-tool investigation
- `compliance_report_brief` — management-ready report template
- `esg_disclosure_brief` — drafts the BRSR Principle-3 section with honest data-gap flags

→ Implements **all three** MCP primitives (rule R10 needs only two) + MCP Tasks + `@RateLimit`.

## Persistence

Incidents, toolbox-talk trainings, and delivered alerts land in a **SQLite DB**
(`better-sqlite3`, WAL) at `SURAKSHA_DB_PATH` (default `./data/suraksha.db`; volume-mounted
in docker-compose). This is what makes month-over-month ESG trends real — data survives
restarts. Swap-in path to Postgres/Neon: the store surface in
`mcp-server/src/common/incident.store.ts` is the only file to change.

## Data flow (hero audit)

```
agent calls run_site_safety_audit (Task)
   └─ for each image:
        detect_ppe_violations ──> violations?
             └─ identify_worker_language (from audio) ──> language
             └─ if CRITICAL: ctx.task.requestInput()  ← human-in-the-loop
             └─ generate_voice_alert (Indic-TTS)      ──> spoken alert
             └─ append to incidents resource
   └─ compile regulation-cited report  (progress streamed throughout)
```

## Multi-host / multi-agent proof (for the demo)
1. **Host A — Claude/NitroStudio:** planner agent runs the full audit Task, streams progress.
2. **Host B — a second MCP client (e.g. ChatGPT/Copilot Studio or a CLI agent):** a
   "worker liaison" agent calls only `identify_worker_language` + `generate_voice_alert`
   on the SAME deployed server — proving the safety layer is reusable across hosts with
   zero re-integration (the core MCP adaptability claim).

## Verify-against-docs checklist (NitroStack specifics)
- `ResourceDecorator` / `PromptDecorator` exact import names + return shapes.
- Guard/interceptor context accessors (`ctx.request.headers`, `ctx.toolName`).
- `nitro deploy` flags for the public URL (rule R13).
