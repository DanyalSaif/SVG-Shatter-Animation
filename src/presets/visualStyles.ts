import type { VisualStyleId, VisualStyleProfile } from '../types/destructionStyle';

export const STYLIZED_VISUAL_PROFILE: VisualStyleProfile = {
  id: 'stylized',
  smoke: {
    treatment: 'soft',
    outline: 'rgba(205,212,220,0.16)',
    shadow: 'rgba(184,195,205,0.42)',
    base: 'rgba(222,229,232,0.62)',
    highlight: 'rgba(250,248,239,0.58)',
    outlineWidth: 0.45,
    blur: 1.2,
  },
  whisp: {
    treatment: 'soft',
    outline: 'rgba(225,228,232,0.16)',
    base: 'rgba(248,244,235,0.92)',
    highlight: 'rgba(255,255,255,0.48)',
  },
  slash: {
    treatment: 'soft',
    edge: 'rgba(225,238,255,0.18)',
    base: 'rgba(248,252,255,0.92)',
    accent: 'rgba(255,255,255,0.72)',
  },
  particles: { treatment: 'soft', outline: 'rgba(255,255,255,0)' },
  flash: {
    treatment: 'soft',
    outline: 'rgba(255,255,255,0)',
    base: 'rgba(255,255,255,1)',
    accent: 'rgba(255,200,100,1)',
  },
};

export const CEL_SHADED_VISUAL_PROFILE: VisualStyleProfile = {
  id: 'cel-shaded',
  smoke: {
    treatment: 'cel',
    outline: 'rgba(54,61,72,0.9)',
    shadow: 'rgba(151,165,178,0.94)',
    base: 'rgba(210,220,225,0.98)',
    highlight: 'rgba(250,247,234,0.98)',
    outlineWidth: 1.35,
    blur: 0,
  },
  whisp: {
    treatment: 'cel',
    outline: 'rgba(50,55,66,0.95)',
    base: 'rgba(213,219,220,0.98)',
    highlight: 'rgba(250,247,235,0.96)',
  },
  slash: {
    treatment: 'cel',
    edge: 'rgba(44,50,66,0.96)',
    base: 'rgba(224,238,244,1)',
    accent: 'rgba(255,248,199,1)',
  },
  particles: { treatment: 'cel', outline: 'rgba(48,52,62,0.94)' },
  flash: {
    treatment: 'cel',
    outline: 'rgba(53,48,45,0.92)',
    base: 'rgba(255,245,209,1)',
    accent: 'rgba(255,185,82,1)',
  },
};

const VISUAL_STYLE_PROFILES: Record<VisualStyleId, VisualStyleProfile> = {
  stylized: STYLIZED_VISUAL_PROFILE,
  'cel-shaded': CEL_SHADED_VISUAL_PROFILE,
};

export function getVisualStyleProfile(id: VisualStyleId): VisualStyleProfile {
  return VISUAL_STYLE_PROFILES[id];
}
