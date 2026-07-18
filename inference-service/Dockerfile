# SurakshaMCP inference service (Python / FastAPI)
FROM python:3.10-slim

# System deps for librosa/soundfile (audio) and pillow (images)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 ffmpeg libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ppe_classifier.tflite is baked into the image (copied above via `COPY . .` from
# inference-service/models/). /models/* stays available too when docker-compose's
# ./models volume is mounted, so a locally-swapped file still overrides this default.
ENV PPE_WEIGHTS=models/ppe_classifier.tflite \
    LANGID_WEIGHTS=/models/langid.pt \
    TTS_BACKEND=gtts \
    PUBLIC_BASE=http://localhost:8000

# Pre-fetch the pretrained models at BUILD time, not container startup. A cold container
# blocking on huggingface.co / github.com the first time someone calls a tool is fragile
# (one DNS/network hiccup and the whole service hangs); baking them into the image layer
# means a broken download fails the build loudly instead of degrading a live deployment,
# and every container start is instant and network-independent.
RUN python -u -c "print('Fetching yolov8n.pt...'); from ultralytics import YOLO; YOLO('yolov8n.pt'); print('yolov8n.pt OK')"
RUN python -u -c "\
import sys; \
print('Fetching facebook/mms-lid-126 feature extractor...'); sys.stdout.flush(); \
from transformers import AutoFeatureExtractor, Wav2Vec2ForSequenceClassification; \
AutoFeatureExtractor.from_pretrained('facebook/mms-lid-126'); \
print('Fetching facebook/mms-lid-126 model weights...'); sys.stdout.flush(); \
Wav2Vec2ForSequenceClassification.from_pretrained('facebook/mms-lid-126'); \
print('facebook/mms-lid-126 OK')"

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
