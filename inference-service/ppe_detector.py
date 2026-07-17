"""PPE / hazard detector — transfer-learning model #1.

Loads a YOLOv8 model fine-tuned on the Roboflow Construction Site Safety dataset
(10 classes). Falls back to the pretrained yolov8n if custom weights are absent,
so the service still boots for a demo.

Classes: Hardhat, Mask, NO-Hardhat, NO-Mask, NO-Safety Vest, Person,
          Safety Cone, Safety Vest, machinery, vehicle
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

import requests
from PIL import Image

VIOLATION_CLASSES = {"NO-Hardhat", "NO-Mask", "NO-Safety Vest"}


class PpeDetector:
    def __init__(self, weights: str = "ppe_best.pt"):
        self.weights = weights
        self._model = None
        self._loaded_from = None
        self._load()

    def _load(self):
        try:
            from ultralytics import YOLO
            path = self.weights if Path(self.weights).exists() else "yolov8n.pt"
            self._model = YOLO(path)
            self._loaded_from = path
        except Exception as e:  # keep service alive; report via /health
            self._model = None
            self._loaded_from = f"unavailable: {e}"

    def status(self):
        return {"loaded_from": self._loaded_from, "ready": self._model is not None}

    def _read_image(self, image_url: str | None, image_b64: str | None) -> Image.Image:
        if image_url:
            r = requests.get(image_url, timeout=15)
            r.raise_for_status()
            return Image.open(io.BytesIO(r.content)).convert("RGB")
        data = base64.b64decode(image_b64)  # type: ignore[arg-type]
        return Image.open(io.BytesIO(data)).convert("RGB")

    def detect(self, image_url=None, image_b64=None, conf: float = 0.4):
        if self._model is None:
            raise RuntimeError("PPE model not loaded")
        img = self._read_image(image_url, image_b64)
        w, h = img.size
        results = self._model.predict(img, conf=conf, verbose=False)
        detections = []
        for r in results:
            names = r.names
            for b in r.boxes:
                cls = names[int(b.cls[0])]
                x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
                detections.append({
                    "class": cls,
                    "confidence": float(b.conf[0]),
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                })
        violations = [
            {"type": d["class"], "confidence": d["confidence"], "personBbox": d["bbox"]}
            for d in detections if d["class"] in VIOLATION_CLASSES
        ]
        return {
            "detections": detections,
            "violations": violations,
            "compliant": len(violations) == 0,
            "imageWidth": w,
            "imageHeight": h,
        }
