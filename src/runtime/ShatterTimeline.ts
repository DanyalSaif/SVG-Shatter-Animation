/** Milliseconds from the start of a shatter animation. */
export interface ShatterTimeline {
  strikeStart: number;
  impact: number;
  fracture: number;
  motionStart: number;
  extinctionStart: number;
  cleanupStart: number;
  complete: number;
  /** Existing Physical Shatter anticipation cues. */
  compressionEnd?: number;
  shakeStart?: number;
}

import type { DestructionExecutionConfig } from '../types/destructionStyle';
import type { ShatterConfig } from '../types/shatter';
import { getVisualStyleProfile } from '../presets/visualStyles';

/** Compatibility context for callers that have not selected a style explicitly. */
export function createPhysicalExecution(config: ShatterConfig): DestructionExecutionConfig {
  return {
    styleId: 'physical',
    timeline: {
      strikeStart: 0,
      compressionEnd: 50,
      shakeStart: 50,
      impact: 90,
      fracture: 120,
      motionStart: 120,
      extinctionStart: config.animationDuration,
      cleanupStart: config.animationDuration,
      complete: config.animationDuration,
    },
    strike: {
      showSlash: false,
      direction: 'left-to-right',
      angle: 0,
      vector: { x: 1, y: 0 },
    },
    fractureProfile: { kind: 'physical' },
    motionProfile: { kind: 'physical' },
    extinctionProfile: { kind: 'none' },
    smokeProfile: { kind: 'none' },
    audioProfile: { kind: 'physical' },
    visualStyle: 'stylized',
    visualProfile: getVisualStyleProfile('stylized'),
  };
}

export function timelineProgress(elapsed: number, start: number, end: number): number {
  if (end <= start) return elapsed >= end ? 1 : 0;
  return Math.max(0, Math.min(1, (elapsed - start) / (end - start)));
}
