import type { GlobalShatterConfig, PhysicalStyleConfig, StylizedWhispConfig } from '../types/destructionStyle';

export type ConfigChangeEffect = 'replay' | 'rebuild-fracture' | 'reload-source';

export function classifyGlobalChange(patch: Partial<GlobalShatterConfig>): ConfigChangeEffect {
  return Object.prototype.hasOwnProperty.call(patch, 'seed')
    || Object.prototype.hasOwnProperty.call(patch, 'impactMode')
    ? 'rebuild-fracture'
    : 'replay';
}

export function classifyPhysicalChange(
  patch: Partial<Omit<PhysicalStyleConfig, 'kind'>>,
): ConfigChangeEffect {
  return Object.prototype.hasOwnProperty.call(patch, 'fragmentCount')
    ? 'rebuild-fracture'
    : 'replay';
}

export function classifyPhysicalConfigChange(
  previous: PhysicalStyleConfig,
  next: PhysicalStyleConfig,
): ConfigChangeEffect {
  return previous.fragmentCount !== next.fragmentCount ? 'rebuild-fracture' : 'replay';
}

export function classifyStylizedChange(
  previous: StylizedWhispConfig,
  next: StylizedWhispConfig,
): ConfigChangeEffect {
  const fractureChanged = previous.fracture.fragmentCount !== next.fracture.fragmentCount;
  const fractureDirectionChanged = previous.strike.direction !== next.strike.direction
    || previous.strike.angle !== next.strike.angle;
  return fractureChanged || fractureDirectionChanged ? 'rebuild-fracture' : 'replay';
}

export function classifyImpactPointChange(): ConfigChangeEffect {
  return 'rebuild-fracture';
}

export function classifyStyleChange(): ConfigChangeEffect {
  return 'rebuild-fracture';
}

export function classifySourceChange(): ConfigChangeEffect {
  return 'reload-source';
}
