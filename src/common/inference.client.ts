// Thin HTTP client to the Python inference service (YOLOv8 + language-ID + TTS).
// Keeps all model access behind one typed surface so tools stay clean & stateless.
import { Injectable } from '@nitrostack/core';

const BASE = process.env.INFERENCE_URL ?? 'http://localhost:8000';

export interface Detection {
  class: string;          // e.g. 'NO-Hardhat'
  confidence: number;     // 0..1
  bbox: [number, number, number, number]; // x, y, w, h (pixels)
}

export interface PpeResult {
  detections: Detection[];
  violations: { type: string; confidence: number; personBbox?: number[] }[];
  compliant: boolean;
  imageWidth: number;
  imageHeight: number;
}

export interface LangResult {
  language: string;       // ISO code, e.g. 'hi'
  languageName: string;   // e.g. 'Hindi'
  confidence: number;
  topK: { language: string; confidence: number }[];
}

export interface TtsResult {
  audioUrl: string;       // served by the inference service
  language: string;
  text: string;
  durationSec: number;
}

@Injectable()
export class InferenceClient {
  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // fail fast so a slow model never hangs an MCP tool call
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Inference ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  detectPpe(input: { imageUrl?: string; imageBase64?: string; confidence?: number }) {
    return this.post<PpeResult>('/detect_ppe', input);
  }

  identifyLanguage(input: { audioUrl?: string; audioBase64?: string }) {
    return this.post<LangResult>('/identify_language', input);
  }

  synthesizeSpeech(input: { text: string; language: string }) {
    return this.post<TtsResult>('/tts', input);
  }

  async health(): Promise<{ ok: boolean; detail: unknown }> {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5_000) });
      return { ok: res.ok, detail: await res.json() };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  }
}
