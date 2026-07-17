"""Text-to-speech for Indian languages.

Primary backend: AI4Bharat Indic-TTS (MIT, 13 Indian languages) — recommended for
production. Demo fallback: gTTS (fast to wire, needs internet). Swap freely.
"""
from __future__ import annotations

import time
import uuid
from pathlib import Path

# gTTS language codes line up with our ISO codes for the supported set.
GTTS_SUPPORTED = {"hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "en"}


class TtsEngine:
    def __init__(self, backend: str = "gtts", audio_dir: Path = Path("/tmp/suraksha_audio")):
        self.backend = backend
        self.audio_dir = Path(audio_dir)
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    def synthesize(self, text: str, language: str) -> tuple[str, float]:
        fname = f"alert_{language}_{uuid.uuid4().hex[:8]}.mp3"
        out = self.audio_dir / fname
        if self.backend == "indic_tts":
            self._indic_tts(text, language, out)
        else:
            self._gtts(text, language, out)
        # rough duration estimate (words / 2.5 wps); replace with real probe if needed
        dur = max(1.0, len(text.split()) / 2.5)
        return fname, round(dur, 1)

    def _gtts(self, text: str, language: str, out: Path):
        from gtts import gTTS
        lang = language if language in GTTS_SUPPORTED else "en"
        gTTS(text=text, lang=lang).save(str(out))

    def _indic_tts(self, text: str, language: str, out: Path):
        # Production path: call AI4Bharat Indic-TTS (FastPitch + HiFi-GAN) locally or via
        # the Bhashini API. Placeholder raises so misconfig is obvious in /health + logs.
        raise NotImplementedError(
            "Wire AI4Bharat Indic-TTS here (https://github.com/ai4bharat/indic-tts). "
            "Set TTS_BACKEND=gtts for the demo."
        )
