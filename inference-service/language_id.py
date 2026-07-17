"""Spoken-language identifier — transfer-learning model #2.

Extracts MFCC features from a short (~5s) clip and classifies the language with a
small CNN/MLP fine-tuned on the 10-Indian-language speech dataset. If custom
weights are absent, returns a safe default so the service still boots for a demo.

Languages: hi, bn, ta, te, mr, gu, kn, ml, pa, ur
"""
from __future__ import annotations

import base64
import io

import numpy as np
import requests

LANG_NAMES = {
    "hi": "Hindi", "bn": "Bengali", "ta": "Tamil", "te": "Telugu", "mr": "Marathi",
    "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi", "ur": "Urdu",
}
LABELS = list(LANG_NAMES.keys())


class LanguageIdentifier:
    def __init__(self, weights: str = "langid.pt"):
        self.weights = weights
        self._model = None
        self._status = "stub (returns default until weights are trained)"
        self._load()

    def _load(self):
        # Load a trained torch model if present; otherwise run in stub mode.
        try:
            import os
            import torch
            if os.path.exists(self.weights):
                self._model = torch.load(self.weights, map_location="cpu")
                self._model.eval()
                self._status = f"loaded: {self.weights}"
        except Exception as e:
            self._status = f"stub (load failed: {e})"

    def status(self):
        return {"detail": self._status, "ready": self._model is not None}

    def _features(self, audio_url=None, audio_b64=None) -> np.ndarray:
        import librosa
        if audio_url:
            r = requests.get(audio_url, timeout=15)
            r.raise_for_status()
            y, sr = librosa.load(io.BytesIO(r.content), sr=16000, duration=5.0)
        else:
            data = base64.b64decode(audio_b64)  # type: ignore[arg-type]
            y, sr = librosa.load(io.BytesIO(data), sr=16000, duration=5.0)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
        # (40,) mean vector — matches the training feature in train_language_id.py
        return np.mean(mfcc, axis=1)

    def identify(self, audio_url=None, audio_b64=None):
        feats = self._features(audio_url, audio_b64)
        if self._model is None:
            # Stub: deterministic pseudo-pick so the demo pipeline runs end-to-end.
            idx = int(abs(feats.sum())) % len(LABELS)
            code = LABELS[idx]
            return self._resp(code, 0.51, stub=True)
        import torch
        with torch.no_grad():
            logits = self._model(torch.tensor(feats, dtype=torch.float32).unsqueeze(0))
            probs = torch.softmax(logits, dim=-1).squeeze(0).tolist()
        order = sorted(range(len(LABELS)), key=lambda i: probs[i], reverse=True)
        top = order[0]
        return self._resp(LABELS[top], float(probs[top]),
                          topk=[{"language": LABELS[i], "confidence": float(probs[i])} for i in order[:3]])

    def _resp(self, code, conf, topk=None, stub=False):
        return {
            "language": code,
            "languageName": LANG_NAMES.get(code, code),
            "confidence": conf,
            "topK": topk or [{"language": code, "confidence": conf}],
            "stub": stub,
        }
