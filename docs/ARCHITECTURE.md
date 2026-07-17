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
| `generate_toolbox_talk` | language | multilingual safety briefing / site induction | no |
| `generate_safety_report` | compliance | regulation-cited report + incident logging | no |
| `run_site_safety_audit` | workflows | **hero** end-to-end audit | **required (long-running Task)** |
| `health_check` | infra | server + backend readiness | no |

**Resources**
- `suraksha://regulations/india` — BOCW / Factories Act / OSHWC / IS clauses by violation type
- `suraksha://incidents/recent` — recent detected incidents

**Prompts**
- `safety_investigation_playbook` — guided multi-tool investigation
- `compliance_report_brief` — management-ready report template

→ Implements **all three** MCP primitives (rule R10 needs only two) + MCP Tasks.

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
