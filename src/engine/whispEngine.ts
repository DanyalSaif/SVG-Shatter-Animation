import type { ExtinctionProfile } from '../types/destructionStyle';
import type { Point, ShatterFragment } from '../types/shatter';
import { createPRNG } from './fractureGenerator';

export interface Whisp {
  id: string;
  fragmentId: number;
  spawnTime: number;
  age: number;
  lifetime: number;
  thickness: number;
  opacity: number;
  drawProgress: number;
  points: Point[];
  alive: boolean;
}

export function selectWhispAnchorIds(
  fragments: ShatterFragment[],
  amount: number,
  seed: number,
  svgWidth: number,
  svgHeight: number,
): Set<number> {
  const targetCount = Math.min(7, Math.max(0, Math.round(amount * 6)));
  if (targetCount === 0) return new Set();

  const rand = createPRNG(seed + 4000);
  const scored = fragments.map(fragment => ({
    fragment,
    score: classScore(fragment.sizeClass) + (fragment.normalizedArea ?? 0) + rand() * 0.35,
  })).sort((a, b) => b.score - a.score || a.fragment.id - b.fragment.id);
  const selected: ShatterFragment[] = [];
  const minDistance = Math.hypot(svgWidth, svgHeight) * 0.12;

  for (const candidate of scored) {
    if (selected.length >= targetCount) break;
    const separated = selected.every(existing => Math.hypot(
      existing.visibleCentroid.x - candidate.fragment.visibleCentroid.x,
      existing.visibleCentroid.y - candidate.fragment.visibleCentroid.y,
    ) >= minDistance);
    if (separated) selected.push(candidate.fragment);
  }
  for (const candidate of scored) {
    if (selected.length >= targetCount) break;
    if (!selected.includes(candidate.fragment)) selected.push(candidate.fragment);
  }

  return new Set(selected.map(fragment => fragment.id));
}

export function createWhisp(
  fragment: ShatterFragment,
  spawnTime: number,
  profile: Extract<ExtinctionProfile, { kind: 'stylized' }>,
  seed: number,
  index: number,
  objectExtent: number,
): Whisp {
  const speed = clamp01(profile.speed);
  const whispLength = clamp01(profile.whispLength);
  const curl = clamp01(profile.curl);
  const rise = clamp01(profile.rise);
  const rand = createPRNG(seed + 4100 + index * 97 + fragment.id * 13);
  const origin = {
    x: fragment.visibleCentroid.x + fragment.x - fragment.initialX,
    y: fragment.visibleCentroid.y + fragment.y - fragment.initialY,
  };
  const velocityLength = Math.hypot(fragment.velocityX, fragment.velocityY) || 1;
  const direction = {
    x: fragment.velocityX / velocityLength,
    y: fragment.velocityY / velocityLength,
  };
  const speedLengthScale = 1 - speed * 0.18;
  const length = Math.max(1, objectExtent) * (0.1 + whispLength * 0.16) * speedLengthScale;
  const inheritedDistance = length * (0.25 + (1 - rise) * 0.2);
  const curlSign = rand() < 0.5 ? -1 : 1;
  const p0 = origin;
  const p1 = {
    x: p0.x + direction.x * inheritedDistance,
    y: p0.y + direction.y * inheritedDistance,
  };
  const p2 = {
    x: p1.x + curlSign * length * curl * 0.42,
    y: p1.y - length * (0.25 + rise * 0.3),
  };
  const p3 = {
    x: p2.x + curlSign * length * curl * 0.15,
    y: p2.y - length * (0.25 + rise * 0.25),
  };
  const authoredLifetime = 350 - speed * 170 + (rand() - 0.5) * 36;
  const lifetime = Math.max(210, Math.min(360, authoredLifetime, Math.max(210, 650 - spawnTime)));

  return {
    id: `whisp-${fragment.id}-${index}`,
    fragmentId: fragment.id,
    spawnTime,
    age: 0,
    lifetime,
    thickness: Math.max(1.8, Math.min(4.8, objectExtent * 0.011)),
    opacity: 0,
    drawProgress: 0,
    points: sampleCubic(p0, p1, p2, p3, 14),
    alive: true,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function updateWhisps(whisps: Whisp[], elapsed: number): boolean {
  let anyAlive = false;
  for (const whisp of whisps) {
    if (!whisp.alive) continue;
    whisp.age = Math.max(0, elapsed - whisp.spawnTime);
    const progress = Math.max(0, Math.min(1, whisp.age / whisp.lifetime));
    whisp.drawProgress = Math.min(1, progress / 0.48);
    whisp.opacity = progress < 0.15
      ? progress / 0.15
      : progress < 0.65 ? 1 : 1 - (progress - 0.65) / 0.35;
    whisp.alive = progress < 1;
    if (whisp.alive) anyAlive = true;
  }
  return anyAlive;
}

export function allWhispsDead(whisps: readonly Whisp[]): boolean {
  return whisps.every(whisp => !whisp.alive);
}

function classScore(sizeClass: ShatterFragment['sizeClass']): number {
  return sizeClass === 'primary' ? 3 : sizeClass === 'secondary' ? 1.8 : 0.2;
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, segments: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push({
      x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
      y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
    });
  }
  return points;
}
