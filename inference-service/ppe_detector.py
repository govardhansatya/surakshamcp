"""PPE / hazard detector — transfer-learning model #1, plus a real localiser.

Supports two model shapes for PPE_WEIGHTS, auto-selected by file extension:

  - `.pt` / `.onnx` -> Ultralytics YOLOv8 object detector (per-object boxes).
    Falls back to pretrained yolov8n if custom weights are absent.

  - `.tflite` -> our trained whole-image multi-label classifier (10 sigmoid
    outputs, NOT a detector — no localisation). It IS accurate for what it
    was trained on: which PPE/hazard conditions are present in the frame.

In `.tflite` (classifier) mode, a SECOND real model is also loaded: plain
COCO-pretrained yolov8n (zero training needed, auto-downloaded, cached after
first run). It contributes real, located Person and vehicle boxes — COCO
has no "machinery"/hardhat classes, so it can't help with PPE violations,
but "person near a moving vehicle" is a real COCO-detectable proximity
hazard, and real Person boxes give an honest worker headcount. The two
models are complementary, not redundant: the classifier owns PPE-violation
classes (which the localiser cannot see), the localiser owns Person/vehicle
boxes (which the classifier cannot place).

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

# Fixed output order of the trained multi-label classifier (ppe_classifier.tflite).
CLASSIFIER_CLASSES = [
    "Hardhat", "Mask", "NO-Hardhat", "NO-Mask", "NO-Safety Vest",
    "Person", "Safety Cone", "Safety Vest", "machinery", "vehicle",
]

# COCO class names (from the pretrained yolov8n) that map onto our vocabulary.
COCO_VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"}


class PpeDetector:
    def __init__(self, weights: str = "ppe_best.pt"):
        self.weights = weights
        self._model = None
        self._mode = None  # 'yolo' | 'tflite-classifier' | None
        self._loaded_from = None
        self._localizer = None          # real-box Person/vehicle detector (classifier mode only)
        self._localizer_status = None
        self._load()

    def _load(self):
        if Path(self.weights).suffix.lower() == ".tflite":
            self._load_tflite()
            self._load_localizer()
        else:
            self._load_yolo()

    def _load_tflite(self):
        try:
            from ai_edge_litert.interpreter import Interpreter
            interp = Interpreter(model_path=self.weights)
            interp.allocate_tensors()
            self._model = interp
            self._mode = "tflite-classifier"
            self._loaded_from = self.weights
        except Exception as e:  # keep service alive; report via /health
            self._model = None
            self._loaded_from = f"unavailable: {e}"

    def _load_localizer(self):
        try:
            from ultralytics import YOLO
            self._localizer = YOLO("yolov8n.pt")
            self._localizer_status = "yolov8n.pt (COCO-pretrained, Person/vehicle boxes only)"
        except Exception as e:
            self._localizer = None
            self._localizer_status = f"unavailable: {e}"

    def _load_yolo(self):
        try:
            from ultralytics import YOLO
            path = self.weights if Path(self.weights).is_file() else "yolov8n.pt"
            self._model = YOLO(path)
            self._mode = "yolo"
            self._loaded_from = path
        except Exception as e:
            self._model = None
            self._loaded_from = f"unavailable: {e}"

    def status(self):
        return {
            "loaded_from": self._loaded_from,
            "mode": self._mode,
            "ready": self._model is not None,
            "localizer": self._localizer_status,
        }

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
        if self._mode == "tflite-classifier":
            return self._detect_tflite(img, conf)
        return self._detect_yolo(img, conf)

    def _detect_yolo(self, img: Image.Image, conf: float):
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
        return self._to_result(detections, w, h)

    def _detect_tflite(self, img: Image.Image, conf: float):
        import numpy as np

        w, h = img.size
        inp = self._model.get_input_details()[0]
        out = self._model.get_output_details()[0]
        _, ih, iw, _ = inp["shape"]
        resized = img.resize((int(iw), int(ih)))
        x = (np.asarray(resized, dtype="float32") / 255.0).reshape(1, ih, iw, 3)
        self._model.set_tensor(inp["index"], x)
        self._model.invoke()
        scores = list(self._model.get_tensor(out["index"])[0])

        # Real, located Person/vehicle boxes from the localiser (if loaded) — these are
        # genuine detections, not placeholders, so proximity-hazard geometry works on them.
        located = self._detect_localized(img, conf) if self._localizer is not None else []
        located_classes = {d["class"] for d in located}

        detections = list(located)
        # Whole-image classification for everything the localiser can't see (PPE-specific
        # classes). Skip 'Person'/'vehicle' here if the localiser already placed them for
        # real — a full-frame duplicate would only add noise, not information.
        for cls, score in zip(CLASSIFIER_CLASSES, scores):
            if score >= conf and cls not in located_classes:
                detections.append({
                    "class": cls,
                    "confidence": float(score),
                    "bbox": [0.0, 0.0, float(w), float(h)],
                })
        return self._to_result(detections, w, h)

    def _detect_localized(self, img: Image.Image, conf: float):
        """Real Person/vehicle boxes from the COCO-pretrained localiser."""
        results = self._localizer.predict(img, conf=conf, verbose=False)
        out = []
        for r in results:
            names = r.names
            for b in r.boxes:
                name = names[int(b.cls[0])]
                if name == "person":
                    mapped = "Person"
                elif name in COCO_VEHICLE_CLASSES:
                    mapped = "vehicle"
                else:
                    continue
                x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
                out.append({
                    "class": mapped,
                    "confidence": float(b.conf[0]),
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                })
        return out

    def _to_result(self, detections, w, h):
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
