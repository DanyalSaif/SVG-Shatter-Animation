import type {
  DestructionStyleId,
  DestructionExecutionConfig,
  GlobalShatterConfig,
  ObjectWeight,
  StyleSpecificConfig,
  VisualStyleId,
} from '../types/destructionStyle';
import type { Point, ShatterConfig, ShatterFragment, SVGInfo } from '../types/shatter';
import type { ShatterTimeline } from '../runtime/ShatterTimeline';
import type { ObjectWeightClass } from '../engine/soundEngine';
import { resolveObjectWeightClass } from '../engine/soundEngine';
import { getDefaultGlobalConfig, getDefaultStyleConfig, resolveStyleExecution } from '../presets/registry';

export interface SerializedFragmentV3 {
  id: number;
  textureDataUrl: string;
  textureWidth: number;
  textureHeight: number;
  textureScale: number;
  initialX: number;
  initialY: number;
  center: Point;
  visibleCentroid: Point;
  area: number;
  visibleArea: number;
  mass: number;
  hullPolygon: Point[];
  clipPolygon: Point[];
  sizeClass?: ShatterFragment['sizeClass'];
  normalizedArea?: number;
  distanceFromImpact?: number;
  aspectRatio?: number;
}

export interface ShatterConfigV3 {
  version: 3;
  destructionStyle: DestructionStyleId;
  visualStyle: VisualStyleId;
  source: {
    width: number;
    height: number;
    viewBox: string;
    fileName: string;
    svgDataUrl: string;
  };
  output: {
    mode: 'responsive-16:9';
    aspectRatio: number;
    maxObjectSize: number;
  };
  global: GlobalShatterConfig;
  physics: ShatterConfig;
  styleConfig: StyleSpecificConfig;
  seed: number;
  impact: {
    mode: ShatterConfig['impactMode'];
    point: Point;
  };
  timeline: ShatterTimeline;
  execution: DestructionExecutionConfig;
  fragments: SerializedFragmentV3[];
  audio: {
    objectWeight: ObjectWeight;
    resolvedObjectWeight: ObjectWeightClass;
    customSoundDataUrl?: string;
  };
}

export interface ShatterConfigV2 {
  version: 2;
  source: { width: number; height: number; svgDataUrl: string };
  output: { mode: string; aspectRatio?: number; maxObjectSize?: number };
  physics: ShatterConfig;
  seed: number;
  impactPoint: Point;
  fragments: Array<Omit<SerializedFragmentV3,
    'center' | 'area' | 'textureScale' | 'sizeClass' | 'normalizedArea' | 'distanceFromImpact' | 'aspectRatio'>>;
  soundDataUrl?: string;
}

export type ShatterExportConfig = ShatterConfigV2 | ShatterConfigV3;

interface CreateV3Options {
  svgInfo: SVGInfo;
  globalConfig: GlobalShatterConfig;
  physics: ShatterConfig;
  styleConfig: StyleSpecificConfig;
  destructionStyle: DestructionStyleId;
  fragments: ShatterFragment[];
  seed: number;
  impactPoint: Point;
  customSoundDataUrl?: string;
}

export function createShatterV3Config(options: CreateV3Options): ShatterConfigV3 {
  const execution = resolveStyleExecution(options.destructionStyle, options.styleConfig, options.physics);
  const requestedWeight = options.styleConfig.kind === 'stylized-whisp'
    ? options.styleConfig.audio.objectWeight
    : 'auto';
  const resolvedWeight = resolveObjectWeightClass(
    requestedWeight,
    options.fragments,
    options.svgInfo.width,
    options.svgInfo.height,
  );
  return {
    version: 3,
    destructionStyle: options.destructionStyle,
    visualStyle: execution.visualStyle,
    source: {
      width: options.svgInfo.width,
      height: options.svgInfo.height,
      viewBox: options.svgInfo.viewBox,
      fileName: options.svgInfo.fileName,
      svgDataUrl: svgToDataUrl(options.svgInfo.sanitized),
    },
    output: { mode: 'responsive-16:9', aspectRatio: 16 / 9, maxObjectSize: 400 },
    global: { ...options.globalConfig },
    physics: { ...options.physics },
    styleConfig: clone(options.styleConfig),
    seed: options.seed,
    impact: { mode: options.physics.impactMode, point: { ...options.impactPoint } },
    timeline: { ...execution.timeline },
    execution: clone(execution),
    fragments: options.fragments.map(fragment => ({
      id: fragment.id,
      textureDataUrl: fragment.canvas.toDataURL('image/png'),
      textureWidth: fragment.canvas.width,
      textureHeight: fragment.canvas.height,
      textureScale: fragment.textureScale ?? 2,
      initialX: fragment.initialX,
      initialY: fragment.initialY,
      center: { ...fragment.center },
      visibleCentroid: { ...fragment.visibleCentroid },
      area: fragment.area,
      visibleArea: fragment.visibleArea,
      mass: fragment.mass,
      hullPolygon: fragment.hullPolygon.map(point => ({ ...point })),
      clipPolygon: fragment.clipPolygon.map(point => ({ ...point })),
      sizeClass: fragment.sizeClass,
      normalizedArea: fragment.normalizedArea,
      distanceFromImpact: fragment.distanceFromImpact,
      aspectRatio: fragment.aspectRatio,
    })),
    audio: {
      objectWeight: requestedWeight,
      resolvedObjectWeight: resolvedWeight,
      customSoundDataUrl: options.customSoundDataUrl,
    },
  };
}

export function normalizeShatterConfig(input: unknown): ShatterConfigV3 {
  if (!input || typeof input !== 'object') throw new Error('Missing configuration');
  const version = (input as { version?: unknown }).version;
  if (version === 3) return input as ShatterConfigV3;
  if (version === 2) return migrateV2ToV3(input as ShatterConfigV2);
  throw new Error(`Unsupported shatter config version: ${String(version)}`);
}

export function migrateV2ToV3(config: ShatterConfigV2): ShatterConfigV3 {
  const destructionStyle: DestructionStyleId = 'physical';
  const styleConfig = getDefaultStyleConfig(destructionStyle);
  const global = {
    ...getDefaultGlobalConfig(destructionStyle),
    background: config.physics.background,
    sound: config.physics.sound,
    soundSource: config.physics.soundSource,
    customSoundVolume: config.physics.customSoundVolume,
    impactMode: config.physics.impactMode,
    seed: config.physics.seed,
    exportFps: config.physics.exportFps,
  };
  const execution = resolveStyleExecution(destructionStyle, styleConfig, config.physics);
  return {
    version: 3,
    destructionStyle,
    visualStyle: 'stylized',
    source: {
      ...config.source,
      viewBox: `0 0 ${config.source.width} ${config.source.height}`,
      fileName: 'legacy-export.svg',
    },
    output: {
      mode: 'responsive-16:9',
      aspectRatio: config.output.aspectRatio ?? 16 / 9,
      maxObjectSize: config.output.maxObjectSize ?? 400,
    },
    global,
    physics: { ...config.physics },
    styleConfig,
    seed: config.seed,
    impact: { mode: config.physics.impactMode, point: { ...config.impactPoint } },
    timeline: { ...execution.timeline },
    execution: clone(execution),
    fragments: config.fragments.map(fragment => ({
      ...fragment,
      center: { ...fragment.visibleCentroid },
      area: fragment.visibleArea,
      textureScale: 2,
    })),
    audio: {
      objectWeight: 'auto',
      resolvedObjectWeight: 'medium',
      customSoundDataUrl: config.soundDataUrl,
    },
  };
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
