#!/usr/bin/env bash
# Quick end-to-end smoke test of the inference service (run it first, port 8000).
set -euo pipefail
BASE="${1:-http://localhost:8000}"

echo "→ /health"
curl -s "$BASE/health" | python3 -m json.tool

echo "→ /detect_ppe (sample image URL)"
curl -s -X POST "$BASE/detect_ppe" \
  -H 'Content-Type: application/json' \
  -d '{"imageUrl":"https://ultralytics.com/images/bus.jpg","confidence":0.35}' | python3 -m json.tool

echo "→ /tts (Hindi hard-hat alert)"
curl -s -X POST "$BASE/tts" \
  -H 'Content-Type: application/json' \
  -d '{"text":"कृपया अपना हेलमेट पहनें।","language":"hi"}' | python3 -m json.tool

echo "Done. For the MCP server, open the project in NitroStudio or run: cd mcp-server && npm run dev"
