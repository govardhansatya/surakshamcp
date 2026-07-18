// Domain logic that turns raw detections into safety violations + severity.
// Kept separate from the tool so it is unit-testable and stateless.
import { Injectable } from '@nitrostack/core';
import type { PpeResult, Detection } from '../../common/inference.client.js';

// Severity weighting: head/height hazards are life-threatening; mask is lower.
const SEVERITY: Record<string, 'critical' | 'high' | 'medium'> = {
  'NO-Hardhat': 'critical',
  'NO-Safety Vest': 'high',
  'NO-Mask': 'medium',
};

export interface Violation {
  type: string;
  severity: 'critical' | 'high' | 'medium';
  confidence: number;
  message: string;        // short, plain-English (will be translated for voice)
}

@Injectable()
export class SafetyService {
  interpret(result: PpeResult): { violations: Violation[]; summary: string } {
    const violations: Violation[] = result.detections
      .filter((d: Detection) => d.class in SEVERITY)
      .map((d: Detection) => ({
        type: d.class,
        severity: SEVERITY[d.class],
        confidence: Number(d.confidence.toFixed(2)),
        message: this.humanMessage(d.class),
      }));

    const persons = result.detections.filter((d) => d.class === 'Person').length;
    const summary =
      violations.length === 0
        ? `No PPE violations detected across ${persons} worker(s).`
        : `${violations.length} violation(s) across ${persons} worker(s): ` +
          violations.map((v) => `${v.type} (${v.severity})`).join(', ') + '.';

    return { violations, summary };
  }

  // Vision-based proximity: flag a worker dangerously close to machinery/vehicle (struck-by).
  // Approximate image-space heuristic — a low-cost complement to UWB collision-avoidance
  // (EMESRT L7 audible alerts), not a sub-second replacement. This is the DYNAMIC-hazard case
  // where an immediate spoken warning in the worker's language genuinely prevents incidents.
  proximityHazards(result: PpeResult): Violation[] {
    const persons = result.detections.filter((d: Detection) => d.class === 'Person');
    const movers = result.detections.filter(
      (d: Detection) => d.class === 'machinery' || d.class === 'vehicle',
    );
    const diag = Math.hypot(result.imageWidth || 1, result.imageHeight || 1);
    const out: Violation[] = [];
    for (const p of persons) {
      for (const m of movers) {
        // Whole-image classifier mode stands every class in for the same full-frame box, which
        // would otherwise always read as a 0-gap overlap here. Identical boxes carry no real
        // localisation signal, so skip them rather than report a spurious critical hazard.
        if (this.sameBbox(p.bbox, m.bbox)) continue;
        const gap = this.boxGap(p.bbox, m.bbox);
        if (gap < 0.06 * diag) {
          out.push({
            type: `Proximity: person near ${m.class}`,
            severity: gap <= 0 ? 'critical' : 'high',
            confidence: Number(Math.min(p.confidence, m.confidence).toFixed(2)),
            message: `A worker is dangerously close to moving ${m.class}. Struck-by / run-over risk.`,
          });
          break;
        }
      }
    }
    return out;
  }

  // 0 if boxes overlap, else the minimum edge-gap in pixels. bbox = [x, y, w, h].
  private boxGap(
    a: [number, number, number, number],
    b: [number, number, number, number],
  ): number {
    const [ax, ay, aw, ah] = a;
    const [bx, by, bw, bh] = b;
    const dx = Math.max(0, Math.max(ax - (bx + bw), bx - (ax + aw)));
    const dy = Math.max(0, Math.max(ay - (by + bh), by - (ay + ah)));
    return Math.hypot(dx, dy);
  }

  private sameBbox(
    a: [number, number, number, number],
    b: [number, number, number, number],
  ): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }

  private humanMessage(cls: string): string {
    switch (cls) {
      case 'NO-Hardhat':
        return 'A worker is not wearing a hard hat. Falling-object and head-injury risk.';
      case 'NO-Safety Vest':
        return 'A worker is not wearing a hi-vis vest. Vehicle/machinery struck-by risk.';
      case 'NO-Mask':
        return 'A worker is not wearing a mask in a dust/particulate zone.';
      default:
        return `Safety issue detected: ${cls}.`;
    }
  }
}
