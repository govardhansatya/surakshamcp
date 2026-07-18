"""Spoken-language identifier — transfer-learning model #2.

Uses Meta's MMS-LID-126 (facebook/mms-lid-126, CC-BY-NC 4.0), a Wav2Vec2 model
pretrained on 126 languages via the Massively Multilingual Speech project.
Auto-downloaded from Hugging Face Hub on first use and cached — no local
training or dataset required, and no custom checkpoint to keep in sync.

We restrict its 126-way output to our 10 supported Indian languages (the ones
we have canned safety phrases + TTS for) and report confidence renormalised
over just that closed set, since a worker is realistically speaking one of
these — not some contextually-irrelevant 111th language we can't act on.

Languages: hi, bn, ta, te, mr, gu, kn, ml, pa, ur
"""
from __future__ import annotations

import base64
import io

import requests

# MMS-LID-126 label -> our ISO 639-1 codes.
MMS_LABEL_TO_ISO = {
    "hin": "hi", "ben": "bn", "tam": "ta", "tel": "te", "mar": "mr",
    "guj": "gu", "kan": "kn", "mal": "ml", "pan": "pa", "urd": "ur",
}
LANG_NAMES = {
    "hi": "Hindi", "bn": "Bengali", "ta": "Tamil", "te": "Telugu", "mr": "Marathi",
    "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi", "ur": "Urdu",
}
MODEL_ID = "facebook/mms-lid-126"


class LanguageIdentifier:
    def __init__(self, weights: str = "langid.pt"):
        # `weights` kept for interface compatibility (unused) — MMS-LID is pretrained
        # and downloads from the HF Hub rather than a local checkpoint.
        self._model = None
        self._feature_extractor = None
        self._label_to_idx = None
        self._status = "loading"
        self._load()

    def _load(self):
        try:
            from transformers import AutoFeatureExtractor, Wav2Vec2ForSequenceClassification
            self._feature_extractor = AutoFeatureExtractor.from_pretrained(MODEL_ID)
            self._model = Wav2Vec2ForSequenceClassification.from_pretrained(MODEL_ID)
            self._model.eval()
            id2label = self._model.config.id2label
            # Precompute: our ISO code -> the model's output index, for the closed-set restriction.
            self._label_to_idx = {
                MMS_LABEL_TO_ISO[lbl]: idx for idx, lbl in id2label.items() if lbl in MMS_LABEL_TO_ISO
            }
            missing = set(LANG_NAMES) - set(self._label_to_idx)
            if missing:
                raise RuntimeError(f"MMS-LID-126 missing expected languages: {missing}")
            self._status = f"loaded: {MODEL_ID} (pretrained, closed-set to {len(self._label_to_idx)} languages)"
        except Exception as e:
            self._model = None
            self._status = f"stub (load failed: {e})"

    def status(self):
        return {"detail": self._status, "ready": self._model is not None}

    def _load_audio(self, audio_url=None, audio_b64=None):
        import librosa
        if audio_url:
            r = requests.get(audio_url, timeout=15)
            r.raise_for_status()
            y, sr = librosa.load(io.BytesIO(r.content), sr=16000, duration=10.0)
        else:
            data = base64.b64decode(audio_b64)  # type: ignore[arg-type]
            y, sr = librosa.load(io.BytesIO(data), sr=16000, duration=10.0)
        return y

    def identify(self, audio_url=None, audio_b64=None):
        y = self._load_audio(audio_url, audio_b64)
        if self._model is None:
            # Stub: deterministic pseudo-pick so the demo pipeline runs end-to-end even
            # if the model failed to download (e.g. no network at runtime).
            codes = list(LANG_NAMES.keys())
            idx = int(abs(hash(y.tobytes()[:64]))) % len(codes)
            code = codes[idx]
            return self._resp(code, 0.51, stub=True)

        import torch
        inputs = self._feature_extractor(y, sampling_rate=16000, return_tensors="pt")
        with torch.no_grad():
            logits = self._model(**inputs).logits[0]

        # Closed-set restriction: renormalise softmax over just our 10 supported languages.
        our_indices = [self._label_to_idx[code] for code in LANG_NAMES]
        our_logits = logits[our_indices]
        probs = torch.softmax(our_logits, dim=-1).tolist()
        ranked = sorted(zip(LANG_NAMES.keys(), probs), key=lambda kv: kv[1], reverse=True)

        top_code, top_conf = ranked[0]
        return self._resp(
            top_code, float(top_conf),
            topk=[{"language": code, "confidence": float(p)} for code, p in ranked[:3]],
        )

    def _resp(self, code, conf, topk=None, stub=False):
        return {
            "language": code,
            "languageName": LANG_NAMES.get(code, code),
            "confidence": conf,
            "topK": topk or [{"language": code, "confidence": conf}],
            "stub": stub,
        }
