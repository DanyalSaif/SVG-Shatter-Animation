import assert from 'node:assert/strict';
import { generateFracture } from '../src/engine/fractureGenerator';
import { classifyFragmentMetadata } from '../src/engine/fragmentBuilder';
import { resolveStrikeVector } from '../src/engine/strikeEngine';
import { createCentralSmokePuffs, selectShardSmokeIds, updateSmoke } from '../src/engine/smokeEngine';
import { createWhisp, selectWhispAnchorIds, updateWhisps } from '../src/engine/whispEngine';
import { spawnExtinctionMotes, spawnParticles, spawnStylizedImpactParticles } from '../src/engine/particleEngine';
import { resolveObjectWeightClass } from '../src/engine/soundEngine';
import { resolveVisibleImpactPoint } from '../src/engine/alphaMask';
import { getSourceRasterScale } from '../src/runtime/renderLimits';
import {
  getDefaultGlobalConfig,
  getDefaultStyleConfig,
  isStyleConfigModified,
  resolveStyleConfig,
  resolveStyleExecution,
} from '../src/presets/registry';
import {
  classifyGlobalChange,
  classifyPhysicalConfigChange,
  classifyStylizedChange,
} from '../src/config/changeEffects';
import type { ShatterFragment } from '../src/types/shatter';

const mask = new Uint8Array(40 * 40).fill(1);
const fractureOptions = {
  fragmentCount: 12,
  seed: 12345,
  svgWidth: 100,
  svgHeight: 100,
  impactPoint: { x: 48, y: 52 },
  mask,
  maskWidth: 40,
  maskHeight: 40,
} as const;
const fractureA = generateFracture(fractureOptions);
const fractureB = generateFracture(fractureOptions);
assert.deepEqual(fractureA, fractureB, 'same seed must reproduce fracture geometry');
assert.notDeepEqual(fractureA, generateFracture({ ...fractureOptions, seed: 54321 }), 'new seed must vary fracture geometry');

for (const direction of ['left-to-right', 'right-to-left', 'rising-diagonal', 'falling-diagonal', 'downward'] as const) {
  const vector = resolveStrikeVector(direction, 90);
  assert.ok(Number.isFinite(vector.x) && Number.isFinite(vector.y));
  assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - 1) < 1e-9);
}

const physicalDefault = getDefaultStyleConfig('physical');
assert.equal(isStyleConfigModified('physical', physicalDefault), false);
assert.equal(isStyleConfigModified('physical', { ...physicalDefault, breakStrength: physicalDefault.kind === 'physical' ? physicalDefault.breakStrength + 0.01 : 0 }), true);
assert.equal(classifyGlobalChange({ background: 'dark' }), 'replay');
assert.equal(classifyGlobalChange({ seed: 9 }), 'rebuild-fracture');
if (physicalDefault.kind === 'physical') {
  assert.equal(classifyPhysicalConfigChange(physicalDefault, { ...physicalDefault, gravity: 0 }), 'replay');
  assert.equal(classifyPhysicalConfigChange(physicalDefault, { ...physicalDefault, fragmentCount: 40 }), 'rebuild-fracture');
}

const stylized = getDefaultStyleConfig('stylized-whisp');
assert.equal(stylized.kind, 'stylized-whisp');
if (stylized.kind !== 'stylized-whisp') throw new Error('Stylized preset resolution failed');
assert.deepEqual(stylized.fracture, {
  fragmentCount: 16,
  spread: 0.29,
  force: 0.62,
  rotation: 0.46,
});
assert.deepEqual(stylized.smoke, {
  shardAmount: 0.31,
  shardConversionSpeed: 0.7,
  centralAmount: 0.28,
  centralConversionSpeed: 0.8,
});
assert.deepEqual(stylized.whisp, {
  whispAmount: 0.45,
  whispLength: 0.65,
  curl: 0.45,
  rise: 0.55,
});
const cel = { ...stylized, appearance: { visualStyle: 'cel-shaded' as const } };
assert.equal(classifyStylizedChange(stylized, cel), 'replay');
const global = { ...getDefaultGlobalConfig('stylized-whisp'), seed: 12345, sound: false };
const engineConfig = resolveStyleConfig('stylized-whisp', global, stylized);
const executionA = resolveStyleExecution('stylized-whisp', stylized, engineConfig);
const executionB = resolveStyleExecution('stylized-whisp', cel, resolveStyleConfig('stylized-whisp', global, cel));
const simulation = ({ visualStyle: _style, visualProfile: _profile, ...rest }: typeof executionA) => rest;
assert.deepEqual(simulation(executionA), simulation(executionB), 'visual style must not alter simulation');

const fragments = Array.from({ length: 18 }, (_, id) => makeFragment(id));
const classifiedA = classifyFragmentMetadata(fragments.map(cloneFragment), { x: 50, y: 50 }, 100, 100);
const classifiedB = classifyFragmentMetadata(fragments.map(cloneFragment), { x: 50, y: 50 }, 100, 100);
assert.deepEqual(classifiedA.map(metadata), classifiedB.map(metadata));
const stylizedHierarchy = classifyFragmentMetadata(
  Array.from({ length: 16 }, (_, id) => makeFragment(id)),
  { x: 50, y: 50 },
  100,
  100,
  { primaryRatio: 0.22, secondaryRatio: 0.42 },
);
assert.deepEqual(
  ['primary', 'secondary', 'micro'].map(sizeClass => stylizedHierarchy.filter(fragment => fragment.sizeClass === sizeClass).length),
  [4, 7, 5],
);

if (executionA.smokeProfile.kind !== 'stylized' || executionA.extinctionProfile.kind !== 'stylized') {
  throw new Error('Stylized profiles were not resolved');
}
const smokeOptions = {
  profile: executionA.smokeProfile,
  fallbackPoints: classifiedA.map(fragment => fragment.visibleCentroid),
  svgWidth: 100,
  svgHeight: 100,
  objectExtent: 85,
  impactPoint: { x: 50, y: 50 },
  strikeVector: executionA.strike.vector,
  seed: 12345,
  spawnTime: 0,
};
assert.deepEqual(createCentralSmokePuffs(smokeOptions), createCentralSmokePuffs(smokeOptions));
assert.equal(createCentralSmokePuffs({ ...smokeOptions, profile: { ...executionA.smokeProfile, centralAmount: 0 } }).length, 0);
const maximumSmoke = createCentralSmokePuffs({ ...smokeOptions, profile: { ...executionA.smokeProfile, centralAmount: 1 } });
assert.ok(maximumSmoke.length <= 4 && maximumSmoke.every(puff => Number.isFinite(puff.baseRadius) && puff.baseRadius <= 85));
for (const elapsed of [0, 1, 50, 250, 10_000]) updateSmoke(maximumSmoke, elapsed);
assert.ok(maximumSmoke.every(puff => [puff.position.x, puff.position.y, puff.scale, puff.opacity].every(Number.isFinite) && !puff.alive));
const shardIdsA = selectShardSmokeIds(classifiedA, 1, 12345);
assert.deepEqual([...shardIdsA], [...selectShardSmokeIds(classifiedA, 1, 12345)]);
assert.ok(shardIdsA.size <= 8);

const anchorsA = selectWhispAnchorIds(classifiedA, 1, 12345, 100, 100);
assert.deepEqual([...anchorsA], [...selectWhispAnchorIds(classifiedA, 1, 12345, 100, 100)]);
assert.ok(anchorsA.size <= 7);
assert.equal(selectWhispAnchorIds(stylizedHierarchy, stylized.whisp.whispAmount, 12345, 100, 100).size, 3);
const anchor = classifiedA.find(fragment => anchorsA.has(fragment.id))!;
const whispA = createWhisp(anchor, 180, executionA.extinctionProfile, 12345, 0, 85);
const whispB = createWhisp(anchor, 180, executionA.extinctionProfile, 12345, 0, 85);
assert.deepEqual(whispA, whispB);
assert.ok(whispA.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
for (const whispLength of [0, 1]) for (const curl of [0, 1]) for (const rise of [0, 1]) {
  const extremeProfile = { ...executionA.extinctionProfile, whispLength, curl, rise };
  const extreme = createWhisp(anchor, 0, extremeProfile, 12345, 0, 85);
  updateWhisps([extreme], 10_000);
  assert.ok(!extreme.alive && extreme.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
}

const physicalEngine = resolveStyleConfig('physical', { ...getDefaultGlobalConfig('physical'), sound: false }, physicalDefault);
assert.ok(spawnParticles({ x: 50, y: 50 }, { ...physicalEngine, particles: 'high' }, 1).length <= 28);
assert.ok(spawnStylizedImpactParticles({ x: 50, y: 50 }, { ...engineConfig, particles: 'high' }, 1, { x: 1, y: 0 }).length <= 10);
assert.ok(spawnExtinctionMotes({ x: 0, y: 0 }, { x: 0, y: 0 }, 1, 0).length <= 3);

assert.equal(resolveObjectWeightClass('auto', classifiedA, 100, 100), resolveObjectWeightClass('auto', classifiedA, 100, 100));
for (const weight of ['small', 'medium', 'large', 'heavy'] as const) {
  assert.equal(resolveObjectWeightClass(weight, classifiedA, 100, 100), weight);
}

const ringMask = new Uint8Array(25);
ringMask[0] = ringMask[4] = ringMask[20] = ringMask[24] = 1;
const safeImpact = resolveVisibleImpactPoint({ x: Number.NaN, y: 500 }, ringMask, 5, 5, 100, 100);
assert.ok(Number.isFinite(safeImpact.x) && Number.isFinite(safeImpact.y));
assert.ok(getSourceRasterScale(100_000, 100_000) > 0 && getSourceRasterScale(100_000, 100_000) <= 2);

console.log('determinism assertions passed');

function makeFragment(id: number): ShatterFragment {
  const x = 5 + (id % 6) * 14;
  const y = 5 + Math.floor(id / 6) * 28;
  const hull = [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 18 }, { x, y: y + 18 }];
  return {
    id,
    clipPolygon: hull,
    center: { x: x + 5, y: y + 9 },
    area: 180,
    visibleArea: 180 - id,
    mass: 9,
    visibleCentroid: { x: x + 5, y: y + 9 },
    hullPolygon: hull,
    canvas: {} as HTMLCanvasElement,
    textureScale: 2,
    initialX: x,
    initialY: y,
    x,
    y,
    angle: 0,
    velocityX: 2,
    velocityY: -1,
    angularVelocity: 0,
  };
}

function cloneFragment(fragment: ShatterFragment): ShatterFragment {
  return { ...fragment, center: { ...fragment.center }, visibleCentroid: { ...fragment.visibleCentroid }, hullPolygon: fragment.hullPolygon.map(point => ({ ...point })), clipPolygon: fragment.clipPolygon.map(point => ({ ...point })) };
}

function metadata(fragment: ShatterFragment) {
  return { id: fragment.id, sizeClass: fragment.sizeClass, normalizedArea: fragment.normalizedArea, distanceFromImpact: fragment.distanceFromImpact, aspectRatio: fragment.aspectRatio };
}
