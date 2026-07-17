"""Train the spoken-language identifier (transfer learning #2).

Two supported approaches:
  (A) Lightweight (hackathon-fast): MFCC features -> small MLP. Trains in minutes on CPU.
  (B) Stronger (recommended): fine-tune a pretrained audio encoder (AI4Bharat IndicWav2Vec,
      MIT) or use Whisper's language-ID head. Higher accuracy, needs a GPU.

Dataset (demo): Kaggle hbchaitanyabharadwaj/audio-dataset-with-10-indian-languages
  (~257k 5s clips; declare as a publicly available dataset per hackathon R12).
Cleaner-licensed alternatives for production: AI4Bharat Kathbath (CC0),
  SPRING-INX (public domain), AI4Bharat IndicVoices (CC BY 4.0).

Usage:
    python train_language_id.py --data ../datasets/indian-languages --epochs 20
Outputs langid.pt -> copy to ../langid.pt for serving.
"""
import argparse
import glob
import os

import numpy as np

LABELS = ["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur"]


def extract_features(wav_path: str) -> np.ndarray:
    import librosa
    y, sr = librosa.load(wav_path, sr=16000, duration=5.0)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
    return np.mean(mfcc, axis=1)  # (40,)


def load_dataset(root: str):
    """Expect root/<lang_code>/*.wav layout."""
    X, y = [], []
    for li, lang in enumerate(LABELS):
        for wav in glob.glob(os.path.join(root, lang, "*.wav")):
            try:
                X.append(extract_features(wav))
                y.append(li)
            except Exception:
                continue
    return np.array(X), np.array(y)


def main():
    import torch
    import torch.nn as nn

    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="root with <lang>/*.wav subfolders")
    ap.add_argument("--epochs", type=int, default=20)
    args = ap.parse_args()

    X, y = load_dataset(args.data)
    if len(X) == 0:
        raise SystemExit("No audio found. Check the dataset layout (root/<lang>/*.wav).")
    Xt = torch.tensor(X, dtype=torch.float32)
    yt = torch.tensor(y, dtype=torch.long)

    model = nn.Sequential(
        nn.Linear(40, 128), nn.ReLU(), nn.Dropout(0.3),
        nn.Linear(128, 128), nn.ReLU(),
        nn.Linear(128, len(LABELS)),
    )
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = nn.CrossEntropyLoss()

    for ep in range(args.epochs):
        opt.zero_grad()
        out = model(Xt)
        loss = loss_fn(out, yt)
        loss.backward()
        opt.step()
        acc = (out.argmax(1) == yt).float().mean().item()
        print(f"epoch {ep+1}/{args.epochs}  loss={loss.item():.3f}  acc={acc:.3f}")

    torch.save(model, "langid.pt")
    print("Saved langid.pt -> copy to ../langid.pt for serving.")


if __name__ == "__main__":
    main()
