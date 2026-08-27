import type { ExtinctionProfile } from '../types/destructionStyle';
import type { ShatterFragment } from '../types/shatter';
import { createPRNG } from './fractureGenerator';

export interface FragmentRuntimeState {
  fragmentId: number;
  spawnTime: number;
  lifetime: number;
  extinctionStart: number;
  extinctionDuration: number;
  whispSpawnTime: number;
  smokeSpawnTime: number;
  opacity: number;
  scale: number;
  extinctionProgress: number;
  alive: boolean;
  whispSpawned: boolean;
  smokeSpawned: boolean;
}

export function createFragmentLifecycles(
  fragments: ShatterFragment[],
  profile: Extract<ExtinctionProfile, { kind: 'stylized' }>,
  seed: number,
): Map<number, FragmentRuntimeState> {
  const rand = createPRNG(seed + 3000);
  const states = new Map<number, FragmentRuntimeState>();
  const speedScale = 1.12 - profile.speed * 0.17;

  for (const fragment of fragments) {
    const sizeClass = fragment.sizeClass ?? 'secondary';
    const variation = 1 + (rand() * 2 - 1) * profile.lifetimeVariation;
    const lifetime = Math.max(
      90,
      profile.baseLifetime * profile.classLifetime[sizeClass] * speedScale * variation,
    );
    const startRatio = Math.max(0.62, profile.extinctionStartRatio - profile.speed * 0.04);
    const extinctionStart = lifetime * startRatio;

    states.set(fragment.id, {
      fragmentId: fragment.id,
      spawnTime: 0,
      lifetime,
      extinctionStart,
      extinctionDuration: lifetime - extinctionStart,
      whispSpawnTime: extinctionStart + (20 + rand() * 20) * (1.12 - profile.speed * 0.3),
      smokeSpawnTime: extinctionStart + (lifetime - extinctionStart) * (0.01 + rand() * 0.03),
      opacity: 1,
      scale: 1,
      extinctionProgress: 0,
      alive: true,
      whispSpawned: false,
      smokeSpawned: false,
    });
  }

  return states;
}

export function updateFragmentLifecycles(
  states: Map<number, FragmentRuntimeState>,
  elapsed: number,
  profile: Extract<ExtinctionProfile, { kind: 'stylized' }>,
  whispAnchorIds: ReadonlySet<number>,
  onWhispReady: (state: FragmentRuntimeState) => void,
  smokeAnchorIds: ReadonlySet<number> = new Set(),
  onSmokeReady?: (state: FragmentRuntimeState) => void,
) {
  const fadeStart = (1 - profile.fadeAmount) * 0.78;
  const scaleEnd = Math.max(0.7, profile.scaleEnd - (1 - profile.fadeAmount) * 0.08);

  for (const state of states.values()) {
    if (!state.alive) continue;

    if (
      smokeAnchorIds.has(state.fragmentId)
      && !state.smokeSpawned
      && elapsed >= state.smokeSpawnTime
    ) {
      state.smokeSpawned = true;
      onSmokeReady?.(state);
    }

    if (
      whispAnchorIds.has(state.fragmentId)
      && !state.whispSpawned
      && elapsed >= state.whispSpawnTime
    ) {
      state.whispSpawned = true;
      onWhispReady(state);
    }

    if (elapsed < state.extinctionStart) continue;
    const progress = clamp01((elapsed - state.extinctionStart) / state.extinctionDuration);
    const eased = smoothstep(progress);
    state.extinctionProgress = progress;
    state.scale = 1 + Math.sin(Math.min(1, progress * 5) * Math.PI) * 0.012
      - (1 - scaleEnd) * eased;
    const opacityProgress = clamp01((progress - fadeStart) / Math.max(0.001, 1 - fadeStart));
    state.opacity = 1 - smoothstep(opacityProgress);

    if (progress >= 1) {
      state.opacity = 0;
      state.scale = scaleEnd;
      state.alive = false;
    }
  }
}

export function allFragmentsDead(states: ReadonlyMap<number, FragmentRuntimeState>): boolean {
  for (const state of states.values()) {
    if (state.alive) return false;
  }
  return true;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
