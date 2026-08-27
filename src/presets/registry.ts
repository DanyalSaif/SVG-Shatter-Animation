import type {
  DestructionStyleId,
  DestructionStylePreset,
  DestructionExecutionConfig,
  GlobalShatterConfig,
  PhysicalStyleConfig,
  StyleSpecificConfig,
  StylizedWhispConfig,
} from '../types/destructionStyle';
import type { ShatterConfig } from '../types/shatter';
import { resolveStrikeVector } from '../engine/strikeEngine';
import { PHYSICAL_PRESET } from './physical';
import { STYLIZED_WHISP_PRESET } from './stylizedWhisp';
import { getVisualStyleProfile } from './visualStyles';

export const DESTRUCTION_STYLE_PRESETS: readonly DestructionStylePreset[] = [
  PHYSICAL_PRESET,
  STYLIZED_WHISP_PRESET,
];

export function getDestructionStylePreset(id: DestructionStyleId): DestructionStylePreset {
  const preset = DESTRUCTION_STYLE_PRESETS.find(candidate => candidate.id === id);
  if (!preset) throw new Error(`Unknown destruction style: ${id}`);
  return preset;
}

export function getDefaultGlobalConfig(id: DestructionStyleId): GlobalShatterConfig {
  return { ...getDestructionStylePreset(id).defaultGlobalConfig };
}

export function getDefaultStyleConfig(id: DestructionStyleId): StyleSpecificConfig {
  return cloneStyleConfig(getDestructionStylePreset(id).defaultStyleConfig);
}

/** Compares only preset-owned, user-editable style fields. Global preferences are excluded. */
export function isStyleConfigModified(
  id: DestructionStyleId,
  styleConfig: StyleSpecificConfig,
): boolean {
  return !styleConfigsEqual(styleConfig, getDestructionStylePreset(id).defaultStyleConfig);
}

export function resolveStyleConfig(
  id: DestructionStyleId,
  globalConfig: GlobalShatterConfig,
  styleConfig: StyleSpecificConfig,
): ShatterConfig {
  const preset = getDestructionStylePreset(id);
  const resolved: ShatterConfig = {
    ...preset.defaultEngineConfig,
    ...globalConfig,
  };

  if (styleConfig.kind === 'physical' && preset.capabilities.physicalSettings) {
    Object.assign(resolved, omitKind(styleConfig));
  } else if (styleConfig.kind === 'stylized-whisp' && preset.capabilities.strikeSettings) {
    resolved.fragmentCount = styleConfig.fracture.fragmentCount;
    resolved.breakStrength = styleConfig.fracture.force;
    resolved.rotation = styleConfig.fracture.rotation;
  }

  // Bounce remains the single editable concept while the legacy export field stays coherent.
  resolved.restitution = resolved.bounce * 0.7;
  return resolved;
}

export function resolveStyleExecution(
  id: DestructionStyleId,
  styleConfig: StyleSpecificConfig,
  engineConfig: ShatterConfig,
): DestructionExecutionConfig {
  const preset = getDestructionStylePreset(id);

  if (id === 'stylized-whisp') {
    const stylizedConfig: StylizedWhispConfig = styleConfig.kind === 'stylized-whisp'
      ? styleConfig
      : preset.defaultStyleConfig as StylizedWhispConfig;
    const vector = resolveStrikeVector(stylizedConfig.strike.direction, stylizedConfig.strike.angle);
    const fractureProfile = preset.fractureProfile.kind === 'stylized'
      ? { ...preset.fractureProfile, strikeVector: vector }
      : preset.fractureProfile;
    const motionProfile = preset.motionProfile.kind === 'stylized'
      ? {
          ...preset.motionProfile,
          strikeVector: vector,
          spread: stylizedConfig.fracture.spread,
          force: stylizedConfig.fracture.force,
          rotation: stylizedConfig.fracture.rotation,
          classSpeed: { ...preset.motionProfile.classSpeed },
          gravity: { ...preset.motionProfile.gravity },
        }
      : preset.motionProfile;
    const extinctionProfile = preset.extinctionProfile.kind === 'stylized'
      ? {
          ...preset.extinctionProfile,
          baseLifetime: stylizedConfig.extinction.shardLifetime,
          fadeAmount: stylizedConfig.extinction.fadeAmount,
          speed: stylizedConfig.extinction.speed,
          whispAmount: stylizedConfig.whisp.whispAmount,
          whispLength: stylizedConfig.whisp.whispLength,
          curl: stylizedConfig.whisp.curl,
          rise: stylizedConfig.whisp.rise,
          classLifetime: { ...preset.extinctionProfile.classLifetime },
        }
      : preset.extinctionProfile;
    const smokeProfile = preset.smokeProfile.kind === 'stylized'
      ? { ...preset.smokeProfile, ...stylizedConfig.smoke }
      : preset.smokeProfile;
    const audioProfile = preset.audioProfile.kind === 'stylized'
      ? { ...preset.audioProfile, ...stylizedConfig.audio }
      : preset.audioProfile;

    return {
      styleId: id,
      timeline: { ...preset.timeline },
      strike: {
        showSlash: stylizedConfig.strike.visible,
        direction: stylizedConfig.strike.direction,
        angle: stylizedConfig.strike.angle,
        vector,
      },
      fractureProfile,
      motionProfile,
      extinctionProfile,
      smokeProfile,
      audioProfile,
      visualStyle: stylizedConfig.appearance.visualStyle,
      visualProfile: getVisualStyleProfile(stylizedConfig.appearance.visualStyle),
    };
  }

  return {
    styleId: 'physical',
    timeline: {
      ...preset.timeline,
      extinctionStart: engineConfig.animationDuration,
      cleanupStart: engineConfig.animationDuration,
      complete: engineConfig.animationDuration,
    },
    strike: {
      showSlash: false,
      direction: 'left-to-right',
      angle: 0,
      vector: { x: 1, y: 0 },
    },
    fractureProfile: preset.fractureProfile,
    motionProfile: preset.motionProfile,
    extinctionProfile: preset.extinctionProfile,
    smokeProfile: preset.smokeProfile,
    audioProfile: preset.audioProfile,
    visualStyle: preset.defaultVisualStyle,
    visualProfile: getVisualStyleProfile(preset.defaultVisualStyle),
  };
}

function cloneStyleConfig(config: StyleSpecificConfig): StyleSpecificConfig {
  if (config.kind === 'physical') return { ...config };
  return {
    ...config,
    strike: { ...config.strike },
    fracture: { ...config.fracture },
    extinction: { ...config.extinction },
    smoke: { ...config.smoke },
    whisp: { ...config.whisp },
    audio: { ...config.audio },
    appearance: { ...config.appearance },
  };
}

function omitKind(config: PhysicalStyleConfig): Omit<PhysicalStyleConfig, 'kind'> {
  const { kind: _kind, ...values } = config;
  return values;
}

function styleConfigsEqual(left: StyleSpecificConfig, right: StyleSpecificConfig): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'physical' && right.kind === 'physical') {
    return Object.keys(left).every(key => left[key as keyof PhysicalStyleConfig] === right[key as keyof PhysicalStyleConfig]);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}
