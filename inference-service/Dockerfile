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

# Weights are mounted at /models (see docker-compose). Falls back to yolov8n if absent.
ENV PPE_WEIGHTS=/models/ppe_best.pt \
    LANGID_WEIGHTS=/models/langid.pt \
    TTS_BACKEND=gtts \
    PUBLIC_BASE=http://localhost:8000

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
