"""SurakshaMCP inference service (FastAPI).

Wraps the two transfer-learning models + TTS behind a small REST API that the
NitroStack MCP server calls. This is the deterministic "model layer"; MCP is the
AI-native orchestration layer on top.

Endpoints:
  POST /detect_ppe         -> PPE / hazard detections (YOLOv8, fine-tuned)
  POST /identify_language  -> spoken-language ID (audio classifier, fine-tuned)
  POST /tts                -> spoken safety alert (AI4Bharat Indic-TTS / gTTS)
  GET  /health             -> readiness + model status
  GET  /audio/{file}       -> serves generated alert audio
"""
from __future__ import annotations

import base64
import io
import os
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ppe_detector import PpeDetector
from language_id import LanguageIdentifier
from tts_engine import TtsEngine

AUDIO_DIR = Path(os.getenv("AUDIO_DIR", "/tmp/suraksha_audio"))
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="SurakshaMCP Inference", version="0.1.0")

# Lazy singletons — loaded once at startup.
ppe = PpeDetector(weights=os.getenv("PPE_WEIGHTS", "ppe_best.pt"))
langid = LanguageIdentifier(weights=os.getenv("LANGID_WEIGHTS", "langid.pt"))
tts = TtsEngine(backend=os.getenv("TTS_BACKEND", "gtts"), audio_dir=AUDIO_DIR)


# ---------- request models ----------
class DetectReq(BaseModel):
    imageUrl: str | None = None
    imageBase64: str | None = None
    confidence: float = 0.4


class LangReq(BaseModel):
    audioUrl: str | None = None
    audioBase64: str | None = None


class TtsReq(BaseModel):
    text: str
    language: str


# ---------- endpoints ----------
@app.get("/health")
def health():
    return {
        "status": "ok",
        "ppe_model": ppe.status(),
        "langid_model": langid.status(),
        "tts_backend": tts.backend,
    }


@app.post("/detect_ppe")
def detect_ppe(req: DetectReq):
    if not req.imageUrl and not req.imageBase64:
        raise HTTPException(400, "Provide imageUrl or imageBase64")
    try:
        return ppe.detect(image_url=req.imageUrl, image_b64=req.imageBase64, conf=req.confidence)
    except Exception as e:  # pragma: no cover
        raise HTTPException(500, f"detection failed: {e}")


@app.post("/identify_language")
def identify_language(req: LangReq):
    if not req.audioUrl and not req.audioBase64:
        raise HTTPException(400, "Provide audioUrl or audioBase64")
    try:
        return langid.identify(audio_url=req.audioUrl, audio_b64=req.audioBase64)
    except Exception as e:  # pragma: no cover
        raise HTTPException(500, f"language id failed: {e}")


@app.post("/tts")
def synthesize(req: TtsReq):
    try:
        fname, dur = tts.synthesize(req.text, req.language)
        base = os.getenv("PUBLIC_BASE", "http://localhost:8000")
        return {
            "audioUrl": f"{base}/audio/{fname}",
            "language": req.language,
            "text": req.text,
            "durationSec": dur,
        }
    except Exception as e:  # pragma: no cover
        raise HTTPException(500, f"tts failed: {e}")


@app.get("/audio/{fname}")
def get_audio(fname: str):
    path = AUDIO_DIR / fname
    if not path.exists():
        raise HTTPException(404, "audio not found")
    return FileResponse(path, media_type="audio/mpeg")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
