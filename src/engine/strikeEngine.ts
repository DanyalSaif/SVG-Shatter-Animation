import type { StrikeDirection, StrikeExecutionConfig } from '../types/destructionStyle';
import type { Point } from '../types/shatter';
import type { ShatterTimeline } from '../runtime/ShatterTimeline';
import { timelineProgress } from '../runtime/ShatterTimeline';
import type { StageTransform } from '../runtime/StageTransform';
import { sourceToStage, stageToSource } from '../runtime/StageTransform';

export interface StrikeVisualState {
  active: boolean;
  progress: number;
  start: Point;
  end: Point;
  impact: Point;
  opacity: number;
}

export function resolveStrikeVector(direction: StrikeDirection, angleDegrees: number): Point {
  const angle = Math.max(0, Math.min(90, angleDegrees)) * Math.PI / 180;
  switch (direction) {
    case 'right-to-left': return { x: -1, y: 0 };
    case 'rising-diagonal': return normalize({ x: Math.cos(angle), y: -Math.sin(angle) });
    case 'falling-diagonal': return normalize({ x: Math.cos(angle), y: Math.sin(angle) });
    case 'downward': return { x: 0, y: 1 };
    default: return { x: 1, y: 0 };
  }
}

/** Builds a responsive source-space line whose stage-space path crosses the impact point. */
export function calculateStrikePath(
  impact: Point,
  vector: Point,
  transform: StageTransform,
): { start: Point; end: Point; impact: Point } {
  const direction = normalize(vector);
  const impactStage = sourceToStage(impact, transform);
  const objectExtent = Math.hypot(
    transform.sourceWidth * transform.scale,
    transform.sourceHeight * transform.scale,
  );
  const startStage = {
    x: impactStage.x - direction.x * objectExtent * 0.7,
    y: impactStage.y - direction.y * objectExtent * 0.7,
  };
  const endStage = {
    x: impactStage.x + direction.x * objectExtent * 0.45,
    y: impactStage.y + direction.y * objectExtent * 0.45,
  };

  return {
    start: stageToSource(startStage, transform),
    end: stageToSource(endStage, transform),
    impact,
  };
}

export function getStrikeVisualState(
  elapsed: number,
  timeline: ShatterTimeline,
  strike: StrikeExecutionConfig,
  impact: Point,
  transform: StageTransform,
): StrikeVisualState {
  const endTime = timeline.impact + 30;
  const path = calculateStrikePath(impact, strike.vector, transform);
  const progress = timelineProgress(elapsed, timeline.strikeStart, endTime);
  const fade = elapsed <= timeline.impact
    ? 1
    : 1 - timelineProgress(elapsed, timeline.impact, endTime);

  return {
    active: strike.showSlash && elapsed >= timeline.strikeStart && elapsed <= endTime,
    progress,
    opacity: Math.max(0, fade),
    ...path,
  };
}

function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}
