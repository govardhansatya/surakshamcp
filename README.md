# SurakshaMCP 🦺

> **The first multilingual, voice-first Construction-Safety _MCP server_.**
> A composable safety-intelligence layer, built on **NitroStack**, that any AI agent or MCP host can orchestrate — it detects PPE / hazard violations from a site photo, identifies each worker's spoken language, and delivers spoken safety alerts and regulation-cited compliance reports in **10 Indian languages**. Purpose-built for India's MSME construction sites and low-literacy workforce.

**Amrita University MCP Hackathon 2026 · Track: Open Innovation (Occupational & Construction Safety)**

---

## Why this exists (the problem)

Construction is one of the deadliest industries. On Indian sites the workforce is largely **low-literacy and multilingual/migrant**, so English safety signage and dashboards don't reach the person in danger. Enterprise camera-safety systems exist (viAct, Intenseye, Tentosoft…) but they are **closed dashboards**, **English-first**, and **priced for large firms** — leaving the huge **MSME / small-contractor** long tail unserved.

## What makes it different (3 wedges no incumbent owns)

1. **MCP-native & agent-composable** — safety intelligence exposed as MCP Tools/Resources/Prompts + a long-running Task, orchestrated by *any* host (Claude, ChatGPT, Copilot Studio, a WhatsApp bot). Not another locked dashboard.
2. **Voice-first & multilingual, aimed at the hazards where it wins** — a 2nd transfer-learning model identifies the worker's spoken language; alerts are **spoken** in their mother tongue (10 Indian languages). This is load-bearing for **real-time dynamic hazards** (a worker straying near moving machinery/vehicles — the struck-by/run-over case, cf. **EMESRT L7** audible collision-avoidance alerts) and for **multilingual toolbox-talks / inductions** for migrant crews — *not* merely narrating static signs. (For static PPE habit, enforcement + documentation is the real lever, which the server also provides.)
3. **MSME-affordable** — works on a phone photo or a periodic CCTV frame; no expensive edge hardware.

## Architecture (two services)

```
                 MCP host / agents (Claude, ChatGPT, Copilot Studio, WhatsApp bot)
                                    │  (Model Context Protocol)
                    ┌───────────────▼─────────────────┐
                    │   SurakshaMCP  (NitroStack, TS)  │   ← the judged deliverable
                    │  Tools · Resources · Prompts ·   │
                    │  run_site_safety_audit (Task)    │
                    └───────────────┬─────────────────┘
                                    │  HTTPS (REST)
                    ┌───────────────▼─────────────────┐
                    │  Inference service (Python,      │
                    │  FastAPI)                        │
                    │  • YOLOv8 PPE detector (TL #1)   │
                    │  • Audio language-ID (TL #2)     │
                    │  • AI4Bharat Indic-TTS (voice)   │
                    └──────────────────────────────────┘
```

> **Why the split?** NitroStack is TypeScript; the models are Python. This follows the recommended pattern — *wrap a REST inference service in an MCP server*. MCP is the AI-native orchestration layer; FastAPI is the deterministic model layer.

## Repo layout

| Path | What |
|---|---|
| `mcp-server/` | NitroStack MCP server (Tools, Resources, Prompts, the audit Task). **The star of the submission.** |
| `inference-service/` | Python FastAPI holding the two transfer-learning models + TTS. |
| `inference-service/training/` | Fine-tuning scripts for the PPE detector and the language-ID model. |
| `docs/ARCHITECTURE.md` | Pointer to the full blueprint. |
| `docker-compose.yml` | Runs both services together. |

## Quick start

```bash
# 1. Inference service (Python 3.10+)
cd inference-service
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000        # exposes /detect_ppe /identify_language /tts /health

# 2. MCP server (Node 20.18.1, tsx global: npm i -g tsx)
cd ../mcp-server
cp .env.example .env                              # set INFERENCE_URL=http://localhost:8000
npm install
npm run dev                                       # NitroStack dev server; open in NitroStudio

# Or run both with Docker
docker compose up --build
```

## Datasets & models (all free / open — see blueprint for licenses)

| Component | Source | License |
|---|---|---|
| PPE vision (transfer learning) | Roboflow *Construction Site Safety* (2,801 imgs, 10 classes), YOLOv8 fine-tune | CC BY 4.0 |
| Language ID (transfer learning) | Kaggle *Audio Dataset with 10 Indian Languages* (demo) + AI4Bharat/SPRING-INX (clean) | CC BY 4.0 / CC0 / public domain |
| Voice alerts (TTS) | AI4Bharat **Indic-TTS** (13 Indian languages) | MIT |
| MCP framework | **NitroStack** SDK + CLI | Apache-2.0 |

> ⚠️ **License notes:** YOLOv8 (Ultralytics) is **AGPL-3.0** — fine for this open-source project; export weights to **ONNX** if you ever need closed-source inference. The Kaggle audio set is YouTube-sourced with no explicit license — declared as a "publicly available dataset" per hackathon rule R12, and backed by cleanly-licensed AI4Bharat / SPRING-INX corpora for production.

## License
Apache-2.0 for this repo's original code. Third-party components retain their own licenses (see above).

_Built for the Amrita University MCP Hackathon 2026. Not affiliated with the dataset/model authors._
