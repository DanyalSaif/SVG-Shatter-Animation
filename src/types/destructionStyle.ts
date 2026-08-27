import type { ShatterConfig } from './shatter';
import type { Point } from './shatter';
import type { ShatterTimeline } from '../runtime/ShatterTimeline';

export type DestructionStyleId = 'physical' | 'stylized-whisp';

export type VisualStyleId = 'stylized' | 'cel-shaded';

export type ObjectWeight = 'auto' | 'small' | 'medium' | 'large' | 'heavy';

export type StrikeDirection =
  | 'left-to-right'
  | 'right-to-left'
  | 'rising-diagonal'
  | 'falling-diagonal'
  | 'downward';

export type GlobalShatterConfig = Pick<
  ShatterConfig,
  | 'background'
  | 'sound'
  | 'soundSource'
  | 'customSoundVolume'
  | 'impactMode'
  | 'seed'
  | 'exportFps'
>;

export interface PhysicalStyleConfig {
  kind: 'physical';
  fragmentCount: number;
  breakStrength: number;
  gravity: number;
  bounce: number;
  rotation: number;
  particles: ShatterConfig['particles'];
  screenShake: ShatterConfig['screenShake'];
  airFriction: number;
  fragmentFriction: number;
  impactRadius: number;
  forceVariation: number;
  rotationVariation: number;
  floorEnabled: boolean;
  floorY: number;
  particleLifetime: number;
  animationDuration: number;
}

export interface StylizedWhispConfig {
  kind: 'stylized-whisp';
  strike: {
    direction: StrikeDirection;
    angle: number;
    visible: boolean;
  };
  fracture: {
    fragmentCount: number;
    spread: number;
    force: number;
    rotation: number;
  };
  extinction: {
    shardLifetime: number;
    fadeAmount: number;
    speed: number;
  };
  smoke: {
    shardAmount: number;
    shardConversionSpeed: number;
    centralAmount: number;
    centralConversionSpeed: number;
  };
  whisp: {
    whispAmount: number;
    whispLength: number;
    curl: number;
    rise: number;
  };
  audio: {
    objectWeight: ObjectWeight;
    impactWeight: number;
    debrisLevel: number;
    whispLevel: number;
  };
  appearance: {
    visualStyle: VisualStyleId;
  };
}

export type StyleSpecificConfig = PhysicalStyleConfig | StylizedWhispConfig;

export interface DestructionStyleCapabilities {
  physicalSettings: boolean;
  strikeSettings: boolean;
  extinctionSettings: boolean;
  whispSettings: boolean;
  sizeAwareAudio: boolean;
}

export interface StrikeExecutionConfig {
  showSlash: boolean;
  direction: StrikeDirection;
  angle: number;
  /** Normalized canvas-space direction, where +y points down. */
  vector: Point;
}

export type FractureProfile =
  | { kind: 'physical' }
  | {
      kind: 'stylized';
      impactDensity: number;
      directionalBias: number;
      strikeVector: Point;
    };

export type MotionProfile =
  | { kind: 'physical' }
  | {
      kind: 'stylized';
      strikeVector: Point;
      directionalWeight: number;
      radialWeight: number;
      variationWeight: number;
      spread: number;
      force: number;
      rotation: number;
      classSpeed: {
        primary: readonly [number, number];
        secondary: readonly [number, number];
        micro: readonly [number, number];
      };
      gravity: {
        initialScale: number;
        rampStart: number;
        rampEnd: number;
      };
    };

export type ExtinctionProfile =
  | { kind: 'none' }
  | {
      kind: 'stylized';
      baseLifetime: number;
      classLifetime: {
        primary: number;
        secondary: number;
        micro: number;
      };
      lifetimeVariation: number;
      extinctionStartRatio: number;
      fadeAmount: number;
      scaleEnd: number;
      speed: number;
      whispAmount: number;
      whispLength: number;
      curl: number;
      rise: number;
    };

export type AudioProfile =
  | { kind: 'physical' }
  | {
      kind: 'stylized';
      objectWeight: ObjectWeight;
      impactWeight: number;
      debrisLevel: number;
      whispLevel: number;
    };

export type SmokeProfile =
  | { kind: 'none' }
  | {
      kind: 'stylized';
      shardAmount: number;
      shardConversionSpeed: number;
      centralAmount: number;
      centralConversionSpeed: number;
    };

export interface VisualStyleProfile {
  id: VisualStyleId;
  smoke: {
    treatment: 'soft' | 'cel';
    outline: string;
    shadow: string;
    base: string;
    highlight: string;
    outlineWidth: number;
    blur: number;
  };
  whisp: {
    treatment: 'soft' | 'cel';
    outline: string;
    base: string;
    highlight: string;
  };
  slash: {
    treatment: 'soft' | 'cel';
    edge: string;
    base: string;
    accent: string;
  };
  particles: {
    treatment: 'soft' | 'cel';
    outline: string;
  };
  flash: {
    treatment: 'soft' | 'cel';
    outline: string;
    base: string;
    accent: string;
  };
}

export interface DestructionExecutionConfig {
  styleId: DestructionStyleId;
  timeline: ShatterTimeline;
  strike: StrikeExecutionConfig;
  fractureProfile: FractureProfile;
  motionProfile: MotionProfile;
  extinctionProfile: ExtinctionProfile;
  smokeProfile: SmokeProfile;
  audioProfile: AudioProfile;
  visualStyle: VisualStyleId;
  visualProfile: VisualStyleProfile;
}

export interface DestructionStylePreset {
  id: DestructionStyleId;
  name: string;
  description: string;
  defaultGlobalConfig: GlobalShatterConfig;
  defaultStyleConfig: StyleSpecificConfig;
  /** Executable compatibility defaults consumed by the current engine. */
  defaultEngineConfig: ShatterConfig;
  timeline: ShatterTimeline;
  fractureProfile: FractureProfile;
  motionProfile: MotionProfile;
  extinctionProfile: ExtinctionProfile;
  smokeProfile: SmokeProfile;
  audioProfile: AudioProfile;
  defaultVisualStyle: VisualStyleId;
  capabilities: DestructionStyleCapabilities;
}
