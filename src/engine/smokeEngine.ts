import type { SmokeProfile } from '../types/destructionStyle';
import type { Point, ShatterFragment } from '../types/shatter';
import { createPRNG } from './fractureGenerator';

export interface SmokeLobe {
  offsetX: number;
  offsetY: number;
  radius: number;
}

export interface SmokeContourPoint {
  x: number;
  y: number;
}

export interface SmokePuff {
  id: string;
  kind: 'central' | 'shard';
  fragmentId?: number;
  origin: Point;
  position: Point;
  velocity: Point;
  spawnTime: number;
  age: number;
  lifetime: number;
  conversionDuration: number;
  baseRadius: number;
  scale: number;
  opacity: number;
  peakOpacity: number;
  expansion: number;
  rise: number;
  drift: number;
  rotation: number;
  angularVelocity: number;
  shapeSeed: number;
  lobes: SmokeLobe[];
  contour: SmokeContourPoint[];
  stretchX: number;
  stretchY: number;
  deformationX: number;
  deformationY: number;
  alive: boolean;
}

export interface VisibleSmokeMask {
  mask: Uint8Array;
  width: number;
  height: number;
}

interface CentralSmokeOptions {
  profile: Extract<SmokeProfile, { kind: 'stylized' }>;
  mask?: VisibleSmokeMask;
  fallbackPoints: readonly Point[];
  svgWidth: number;
  svgHeight: number;
  objectExtent?: number;
  impactPoint: Point;
  strikeVector: Point;
  seed: number;
  spawnTime: number;
}

interface ShardSmokeOptions {
  fragment: ShatterFragment;
  profile: Extract<SmokeProfile, { kind: 'stylized' }>;
  objectExtent: number;
  seed: number;
  puffIndex: number;
  spawnTime: number;
}

export function selectShardSmokeIds(
  fragments: readonly ShatterFragment[],
  amount: number,
  seed: number,
): Set<number> {
  if (amount <= 0) return new Set();
  const rand = createPRNG(seed + 6100);
  const eligible: { id: number; score: number }[] = [];
  for (const fragment of fragments) {
    const chance = classEligibility(fragment.sizeClass, amount);
    const roll = rand();
    if (roll <= chance) {
      eligible.push({
        id: fragment.id,
        score: classPriority(fragment.sizeClass) * 2 + (fragment.normalizedArea ?? 0) + (1 - roll) * 0.1,
      });
    }
  }

  const designedCap = Math.min(6, Math.max(1, Math.ceil(fragments.length * (0.055 + amount * 0.22))));
  eligible.sort((a, b) => b.score - a.score || a.id - b.id);
  return new Set(eligible.slice(0, designedCap).map(candidate => candidate.id));
}

export function createCentralSmokePuffs(options: CentralSmokeOptions): SmokePuff[] {
  const { profile, svgWidth, svgHeight, seed, spawnTime } = options;
  const amount = clamp01(profile.centralAmount);
  if (amount <= 0) return [];
  const count = Math.min(4, Math.max(1, Math.ceil(amount * 4)));
  const rand = createPRNG(seed + 6200);
  const candidates = collectCentralCandidates(options);
  if (candidates.length === 0) return [];
  const extent = Math.max(1, options.objectExtent ?? Math.hypot(svgWidth, svgHeight));
  const selected = selectDistributedPoints(candidates, count, rand, extent);

  return selected.map((origin, index) => {
    const outward = normalize({
      x: origin.x - svgWidth / 2,
      y: origin.y - svgHeight / 2,
    });
    const hierarchyScale = index === 0 ? 1 : index === 1 ? 0.68 : index === 2 ? 0.52 : 0.42;
    const size = extent * (0.026 + amount * 0.015) * hierarchyScale * (0.9 + rand() * 0.18);
    return createPuff({
      id: `smoke-central-${index}`,
      kind: 'central',
      origin,
      velocity: {
        x: outward.x * (0.22 + rand() * 0.28) + options.strikeVector.x * 0.12,
        y: outward.y * (0.12 + rand() * 0.2) + options.strikeVector.y * 0.06,
      },
      spawnTime: spawnTime + index * (14 + Math.floor(rand() * 4)),
      lifetime: 178 + rand() * 24,
      conversionDuration: centralConversionDuration(profile.centralConversionSpeed),
      baseRadius: size,
      opacity: (0.32 + amount * 0.36) * (index === 0 ? 1 : 0.78),
      expansion: 0.52 + amount * 0.24 + rand() * 0.12,
      rise: 0.46 + rand() * 0.24,
      drift: (rand() * 2 - 1) * 0.18,
      seed: seed + 6300 + index * 149,
    });
  });
}

export function createShardSmokePuffs(options: ShardSmokeOptions): SmokePuff[] {
  const { fragment, profile, seed, puffIndex, spawnTime } = options;
  const amount = clamp01(profile.shardAmount);
  if (amount <= 0) return [];
  const rand = createPRNG(seed + 6500 + fragment.id * 193 + puffIndex * 31);
  const sizeClass = fragment.sizeClass ?? 'secondary';
  const count = sizeClass === 'primary' && amount >= 0.7 ? 2 : 1;
  const classScale = sizeClass === 'primary' ? 1 : sizeClass === 'secondary' ? 0.68 : 0.3;
  const fragmentRadius = Math.sqrt(Math.max(1, fragment.visibleArea) / Math.PI);
  const origin = currentFragmentCenter(fragment);
  const puffs: SmokePuff[] = [];

  for (let index = 0; index < count; index++) {
    const inherited = 0.24 + rand() * 0.08;
    const localOrigin = {
      x: origin.x + (rand() - 0.5) * options.objectExtent * 0.008,
      y: origin.y + (rand() - 0.5) * options.objectExtent * 0.008,
    };
    puffs.push(createPuff({
      id: `smoke-shard-${fragment.id}-${index}`,
      kind: 'shard',
      fragmentId: fragment.id,
      origin: localOrigin,
      velocity: {
        x: fragment.velocityX * inherited,
        y: fragment.velocityY * inherited,
      },
      spawnTime: spawnTime + index * (14 + rand() * 8),
      lifetime: 170 + rand() * 30,
      conversionDuration: shardConversionDuration(profile.shardConversionSpeed),
      baseRadius: Math.min(
        Math.max(1.2, options.objectExtent * 0.09),
        fragmentRadius * (0.58 + amount * 0.3) * classScale * (index === 0 ? 1 : 0.52),
      ),
      opacity: (0.46 + amount * 0.3) * (0.66 + classScale * 0.34) * (index === 0 ? 1 : 0.72),
      expansion: 0.58 + amount * 0.3 + rand() * 0.14,
      rise: 0.62 + rand() * 0.28,
      drift: (rand() * 2 - 1) * 0.2,
      seed: seed + 6600 + fragment.id * 211 + index * 43,
    }));
  }
  return puffs;
}

export function updateSmoke(puffs: SmokePuff[], elapsed: number): boolean {
  let anyAlive = false;
  for (const puff of puffs) {
    if (!puff.alive || elapsed < puff.spawnTime) continue;
    const previousAge = puff.age;
    puff.age = Math.max(0, elapsed - puff.spawnTime);
    const deltaFrames = Math.max(0, puff.age - previousAge) / (1000 / 60);
    const progress = clamp01(puff.age / puff.lifetime);
    const conversion = clamp01(puff.age / puff.conversionDuration);
    const conversionEase = smoothstep(Math.min(1, conversion * 1.25));
    const fade = progress < 0.58 ? 1 : 1 - smoothstep((progress - 0.58) / 0.42);

    puff.velocity.x *= Math.pow(0.82, deltaFrames);
    puff.velocity.y *= Math.pow(0.86, deltaFrames);
    puff.position.x += (puff.velocity.x + puff.drift * progress) * deltaFrames;
    puff.position.y += (puff.velocity.y - puff.rise * (0.35 + progress * 0.8)) * deltaFrames;
    puff.rotation += puff.angularVelocity * deltaFrames;
    const initialScale = puff.kind === 'shard' ? 0.28 : 0.34;
    puff.scale = initialScale + conversionEase * 0.7 + progress * puff.expansion;
    const deformation = smoothstep(progress);
    puff.stretchX = 1 + puff.deformationX * deformation;
    puff.stretchY = 0.9 + conversionEase * 0.1 + puff.deformationY * deformation;
    puff.opacity = puff.peakOpacity * conversionEase * fade;
    puff.alive = progress < 1;
    if (puff.alive) anyAlive = true;
  }
  return anyAlive;
}

export function allSmokeDead(puffs: readonly SmokePuff[]): boolean {
  return puffs.every(puff => !puff.alive);
}

function createPuff(options: {
  id: string;
  kind: SmokePuff['kind'];
  fragmentId?: number;
  origin: Point;
  velocity: Point;
  spawnTime: number;
  lifetime: number;
  conversionDuration: number;
  baseRadius: number;
  opacity: number;
  expansion: number;
  rise: number;
  drift: number;
  seed: number;
}): SmokePuff {
  const rand = createPRNG(options.seed);
  const lobeCount = 3 + Math.floor(rand() * 5);
  const lobes: SmokeLobe[] = [{ offsetX: 0, offsetY: 0, radius: 1 }];
  for (let index = 1; index < lobeCount; index++) {
    const angle = rand() * Math.PI * 2;
    const distance = 0.24 + rand() * 0.48;
    lobes.push({
      offsetX: Math.cos(angle) * distance,
      offsetY: Math.sin(angle) * distance * 0.78,
      radius: 0.52 + rand() * 0.46,
    });
  }
  const contour = createContour(lobes, rand);
  return {
    id: options.id,
    kind: options.kind,
    fragmentId: options.fragmentId,
    origin: { ...options.origin },
    position: { ...options.origin },
    velocity: { ...options.velocity },
    spawnTime: options.spawnTime,
    age: 0,
    lifetime: options.lifetime,
    conversionDuration: options.conversionDuration,
    baseRadius: Math.max(1.2, options.baseRadius),
    scale: options.kind === 'shard' ? 0.28 : 0.34,
    opacity: 0,
    peakOpacity: options.opacity,
    expansion: options.expansion,
    rise: options.rise,
    drift: options.drift,
    rotation: (rand() * 2 - 1) * 0.22,
    angularVelocity: (rand() * 2 - 1) * 0.018,
    shapeSeed: options.seed,
    lobes,
    contour,
    stretchX: 1,
    stretchY: 0.9,
    deformationX: (rand() * 2 - 1) * 0.2,
    deformationY: 0.28 + rand() * 0.25,
    alive: true,
  };
}

function collectCentralCandidates(options: CentralSmokeOptions): Point[] {
  if (!options.mask) return [...options.fallbackPoints];
  const { mask, width, height } = options.mask;
  const step = Math.max(1, Math.floor(Math.max(width, height) / 90));
  const candidates: Point[] = [];
  const fallback: Point[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (!mask[y * width + x]) continue;
      const point = {
        x: ((x + 0.5) / width) * options.svgWidth,
        y: ((y + 0.5) / height) * options.svgHeight,
      };
      fallback.push(point);
      const centerDistance = Math.hypot(
        (point.x - options.svgWidth / 2) / Math.max(1, options.svgWidth),
        (point.y - options.svgHeight / 2) / Math.max(1, options.svgHeight),
      );
      const impactDistance = Math.hypot(
        (point.x - options.impactPoint.x) / Math.max(1, options.svgWidth),
        (point.y - options.impactPoint.y) / Math.max(1, options.svgHeight),
      );
      if (Math.min(centerDistance, impactDistance * 0.9) <= 0.38) candidates.push(point);
    }
  }
  return candidates.length > 0 ? candidates : fallback.length > 0 ? fallback : [...options.fallbackPoints];
}

function selectDistributedPoints(
  candidates: readonly Point[],
  count: number,
  rand: () => number,
  objectExtent: number,
): Point[] {
  if (candidates.length <= count) return [...candidates];
  const pool = candidates.map(point => ({ point, noise: rand() }));
  pool.sort((a, b) => a.noise - b.noise);
  const selected: Point[] = [];
  const minDistance = objectExtent * 0.045;
  for (const candidate of pool) {
    if (selected.length >= count) break;
    if (selected.every(point => Math.hypot(point.x - candidate.point.x, point.y - candidate.point.y) >= minDistance)) {
      selected.push(candidate.point);
    }
  }
  for (const candidate of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(candidate.point)) selected.push(candidate.point);
  }
  return selected;
}

function currentFragmentCenter(fragment: ShatterFragment): Point {
  return {
    x: fragment.visibleCentroid.x + fragment.x - fragment.initialX,
    y: fragment.visibleCentroid.y + fragment.y - fragment.initialY,
  };
}

function shardConversionDuration(speed: number): number {
  return 155 - clamp01(speed) * 95;
}

function centralConversionDuration(speed: number): number {
  return 105 - clamp01(speed) * 60;
}

function classEligibility(sizeClass: ShatterFragment['sizeClass'], amount: number): number {
  const normalized = clamp01(amount);
  if (sizeClass === 'primary') return Math.min(1, normalized * 2.6);
  if (sizeClass === 'secondary') return Math.max(0, (normalized - 0.18) / 0.82) * 0.82;
  return Math.max(0, (normalized - 0.72) / 0.28) * 0.05;
}

function classPriority(sizeClass: ShatterFragment['sizeClass']): number {
  return sizeClass === 'primary' ? 1 : sizeClass === 'secondary' ? 0.55 : 0.04;
}

function createContour(lobes: readonly SmokeLobe[], rand: () => number): SmokeContourPoint[] {
  const pointCount = 9 + Math.floor(rand() * 2);
  const phaseA = rand() * Math.PI * 2;
  const phaseB = rand() * Math.PI * 2;
  const skewX = (rand() * 2 - 1) * 0.16;
  const skewY = (rand() * 2 - 1) * 0.1;
  const raw: SmokeContourPoint[] = [];
  for (let index = 0; index < pointCount; index++) {
    const angle = index / pointCount * Math.PI * 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    let support = 0.78;
    for (const lobe of lobes) {
      const projectedCenter = lobe.offsetX * direction.x + lobe.offsetY * direction.y;
      support = Math.max(support, projectedCenter + lobe.radius * 0.78);
    }
    const angularVariation = 1
      + Math.sin(angle * 3 + phaseA) * 0.2
      + Math.sin(angle * 5 + phaseB) * 0.1;
    const irregularity = (0.78 + rand() * 0.4) * angularVariation;
    raw.push({
      x: direction.x * support * irregularity + direction.y * skewX,
      y: direction.y * support * irregularity + Math.sin(angle * 2 + phaseB) * 0.11 + skewY,
    });
  }
  return raw.map((point, index) => {
    const previous = raw[(index - 1 + raw.length) % raw.length];
    const next = raw[(index + 1) % raw.length];
    return {
      x: point.x * 0.84 + (previous.x + next.x) * 0.08,
      y: point.y * 0.84 + (previous.y + next.y) * 0.08,
    };
  });
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
