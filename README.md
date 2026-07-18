# SurakshaMCP 🦺 — Voice-First, Multilingual Construction Safety over MCP

> **The first multilingual, voice-first Construction-Safety MCP server.**
> A composable safety-intelligence layer, built on **NitroStack**, that any AI agent or MCP host can orchestrate — it detects PPE / hazard violations from a site photo, identifies each worker's spoken language, and delivers spoken safety alerts and regulation-cited compliance reports in **10 Indian languages**. Purpose-built for India's MSME construction sites and low-literacy workforce.

**Amrita University MCP Hackathon 2026 · Track: Open Innovation (Occupational & Construction Safety)**

---

## Table of Contents

- [Why this exists](#why-this-exists-the-problem)
- [What makes it different](#what-makes-it-different-3-wedges-no-incumbent-owns)
- [What is MCP?](#what-is-mcp)
- [Architecture](#architecture-two-services)
- [Live Demo](#live-demo)
- [Repo layout](#repo-layout)
- [Quick start](#quick-start)
- [Connect to an MCP Client](#connect-to-an-mcp-client)
- [Datasets & models](#datasets--models-all-free--open--see-blueprint-for-licenses)
- [FAQ](#faq)
- [License](#license)

---

## Why this exists (the problem)

Construction is one of the deadliest industries. On Indian sites the workforce is largely **low-literacy and multilingual/migrant**, so English safety signage and dashboards don't reach the person in danger. Enterprise camera-safety systems exist (viAct, Intenseye, Tentosoft…) but they are **closed dashboards**, **English-first**, and **priced for large firms** — leaving the huge **MSME / small-contractor** long tail unserved.

### The scale of the problem

Construction is India's second-most-hazardous sector, averaging an estimated **~38 fatal accidents a day** (IIT Delhi / NIT Surat study) — and even that likely undercounts the real toll, since ~30% of construction labourers are unregistered and largely invisible to formal inspection regimes. Of documented construction deaths, **60% are falls from height** and **25% are structural collapses** — exactly the hazard categories a phone-photo PPE/hazard detector is built to catch.

Meanwhile, SEBI's **BRSR framework** — mandatory for India's top 1000 listed companies, with value-chain ESG disclosure increasingly expected on a comply-or-explain basis — creates a real commercial incentive: **MSME contractors who can produce a BRSR-aligned safety annexe win bids the others can't.**

## What makes it different (3 wedges no incumbent owns)

1. **MCP-native & agent-composable** — safety intelligence exposed as MCP Tools/Resources/Prompts + a long-running Task, orchestrated by *any* host (Claude, ChatGPT, Copilot Studio, a WhatsApp bot). Not another locked dashboard.
2. **Voice-first & multilingual, aimed at the hazards where it wins** — a 2nd transfer-learning model identifies the worker's spoken language; alerts are **spoken** in their mother tongue (10 Indian languages). This is load-bearing for **real-time dynamic hazards** (a worker straying near moving machinery/vehicles — the struck-by/run-over case, cf. **EMESRT L7** audible collision-avoidance alerts) and for **multilingual toolbox-talks / inductions** for migrant crews — *not* merely narrating static signs.
3. **MSME-affordable** — works on a phone photo or a periodic CCTV frame; no expensive edge hardware.
4. **ESG/BRSR-ready** — every detection, toolbox talk, and delivered alert persists to a SQLite incident DB and rolls up into a **SEBI BRSR Principle-3** safety disclosure (`generate_esg_report`, LTIFR, training coverage, monthly trend). Alerts can also be **delivered to a foreman's phone over WhatsApp** (`send_whatsapp_alert`, Twilio).

## What is MCP?

The **Model Context Protocol (MCP)** is an open standard that lets AI assistants securely connect to external tools, data sources, and services. Instead of being limited to what it was trained on, an AI model can call **MCP servers** to fetch live data, run actions, and integrate with real systems.

SurakshaMCP is one such server: it exposes construction-safety intelligence — detection, voice alerts, compliance reporting — as structured Tools, Resources, and Prompts that any MCP-compatible host can call. Built and deployed on [Nitrostack](https://nitrostack.ai).

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

## Live Demo

🚀 **Live MCP endpoint:** https://suraksham-protocol-pioneers-amrita-university-amritapuri-campus.app.nitrocloud.ai

Point your MCP client at the endpoint above to try it instantly.

## Repo layout

| Path | What |
|---|---|
| `mcp-server/` | NitroStack MCP server (Tools, Resources, Prompts, the audit Task). **The star of the submission.** |
| `inference-service/` | Python FastAPI holding the two transfer-learning models + TTS. |
| `inference-service/training/` | Fine-tuning scripts for the PPE detector and the language-ID model. |
| `docs/ARCHITECTURE.md` | Pointer to the full blueprint. |
| `docker-compose.yml` | Runs both services together. |

## Quick start

### Prerequisites

- Node.js 20.18.1+, `tsx` installed globally (`npm i -g tsx`)
- Python 3.10+
- An MCP-compatible client (Claude Desktop, Cursor, etc.)

### Run locally

```bash
# 1. Inference service (Python 3.10+)
cd inference-service
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000        # exposes /detect_ppe /identify_language /tts /health

# 2. MCP server
cd ../mcp-server
cp .env.example .env                              # set INFERENCE_URL=http://localhost:8000
npm install
npm run dev                                       # NitroStack dev server; open in NitroStudio

# Or run both with Docker
docker compose up --build
```

## Connect to an MCP Client

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "surakshamcp": {
      "url": "https://suraksham-protocol-pioneers-amrita-university-amritapuri-campus.app.nitrocloud.ai"
    }
  }
}
```

Restart your client and the tools from this MCP server will be available to your AI assistant.

## Datasets & models (all free / open — see blueprint for licenses)

| Component | Source | License |
|---|---|---|
| PPE vision (transfer learning) | Roboflow *Construction Site Safety* (2,801 imgs, 10 classes), YOLOv8 fine-tune | CC BY 4.0 |
| Language ID (transfer learning) | Kaggle *Audio Dataset with 10 Indian Languages* (demo) + AI4Bharat/SPRING-INX (clean) | CC BY 4.0 / CC0 / public domain |
| Voice alerts (TTS) | AI4Bharat **Indic-TTS** (13 Indian languages) | MIT |
| MCP framework | **NitroStack** SDK + CLI | Apache-2.0 |

> ⚠️ **License notes:** YOLOv8 (Ultralytics) is **AGPL-3.0** — fine for this open-source project; export weights to **ONNX** if you ever need closed-source inference. The Kaggle audio set is YouTube-sourced with no explicit license — declared as a "publicly available dataset" per hackathon rule R12, and backed by cleanly-licensed AI4Bharat / SPRING-INX corpora for production.

## FAQ

**What is an MCP server?**
An MCP server implements the Model Context Protocol to expose tools, resources, and prompts that AI assistants can call — letting an AI model take real actions and access live data instead of relying only on what it was trained on.

**What does SurakshaMCP do?**
It turns a construction-site photo or CCTV frame into a spoken, multilingual safety alert, and rolls every detection into a SEBI BRSR-aligned compliance report — see [Why this exists](#why-this-exists-the-problem) above.

**Which AI clients does this work with?**
Any MCP-compatible client, including Claude Desktop, Cursor, ChatGPT, and Copilot Studio.

**How do I deploy my own MCP app?**
Use [Nitrostack](https://nitrostack.ai) to build, deploy, and host MCP apps without managing infrastructure.

## Keywords

`Open Innovation` · `Occupational & Construction Safety` · `SurakshaMCP` · `MCP` · `Model Context Protocol` · `MCP server` · `Construction Safety AI` · `Voice-first AI` · `Multilingual AI` · `PPE detection` · `BRSR` · `ESG` · `Claude MCP` · `Nitrostack`

## License

Apache-2.0 for this repo's original code. Third-party components retain their own licenses (see [Datasets & models](#datasets--models-all-free--open--see-blueprint-for-licenses) above).

---

_Built for the Amrita University MCP Hackathon 2026. Not affiliated with the dataset/model authors. Built with ❤️ using the Model Context Protocol on [Nitrostack](https://nitrostack.ai)._
