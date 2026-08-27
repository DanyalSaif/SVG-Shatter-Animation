import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PhysicalStyleConfig } from '../types/destructionStyle';
import { RadioGroup, SettingsSection, SliderRow, ToggleRow } from './SettingsControls';

interface PhysicalSettingsProps {
  config: PhysicalStyleConfig;
  onChange: (patch: Partial<Omit<PhysicalStyleConfig, 'kind'>>) => void;
}

export const PhysicalSettings: React.FC<PhysicalSettingsProps> = ({ config, onChange }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <SettingsSection title="Physical Shatter">
      <SliderRow label="Fragments" value={config.fragmentCount} min={6} max={40} onChange={(fragmentCount) => onChange({ fragmentCount })} />
      <SliderRow label="Break Strength" value={Math.round(config.breakStrength * 100)} min={0} max={100} display={percent(config.breakStrength)} onChange={(value) => onChange({ breakStrength: value / 100 })} />
      <SliderRow label="Gravity" value={Math.round(config.gravity * 100)} min={0} max={100} display={percent(config.gravity)} onChange={(value) => onChange({ gravity: value / 100 })} />
      <SliderRow label="Bounce" value={Math.round(config.bounce * 100)} min={0} max={100} display={percent(config.bounce)} onChange={(value) => onChange({ bounce: value / 100 })} />
      <SliderRow label="Rotation" value={Math.round(config.rotation * 100)} min={0} max={100} display={percent(config.rotation)} onChange={(value) => onChange({ rotation: value / 100 })} />
      <RadioGroup label="Particles" value={config.particles} options={[
        { value: 'none', label: 'None' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Med' }, { value: 'high', label: 'High' },
      ]} onChange={(particles) => onChange({ particles: particles as PhysicalStyleConfig['particles'] })} />
      <RadioGroup label="Screen Shake" value={config.screenShake} options={[
        { value: 'none', label: 'None' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Med' }, { value: 'high', label: 'High' },
      ]} onChange={(screenShake) => onChange({ screenShake: screenShake as PhysicalStyleConfig['screenShake'] })} />

      <div className="border-t border-surface-600 pt-3">
        <button type="button" onClick={() => setAdvancedOpen(open => !open)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full">
          {advancedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Physical Advanced
        </button>
        {advancedOpen && (
          <div className="mt-3 space-y-3 pl-2 border-l border-surface-600">
            <SliderRow label="Air Friction" value={Math.round(config.airFriction * 100)} min={0} max={20} display={config.airFriction.toFixed(2)} onChange={(value) => onChange({ airFriction: value / 100 })} />
            <SliderRow label="Fragment Friction" value={Math.round(config.fragmentFriction * 100)} min={0} max={100} display={percent(config.fragmentFriction)} onChange={(value) => onChange({ fragmentFriction: value / 100 })} />
            <SliderRow label="Force Variation" value={Math.round(config.forceVariation * 100)} min={0} max={100} display={percent(config.forceVariation)} onChange={(value) => onChange({ forceVariation: value / 100 })} />
            <SliderRow label="Rotation Variation" value={Math.round(config.rotationVariation * 100)} min={0} max={100} display={percent(config.rotationVariation)} onChange={(value) => onChange({ rotationVariation: value / 100 })} />
            <ToggleRow label="Floor Collision" checked={config.floorEnabled} onChange={(floorEnabled) => onChange({ floorEnabled })} />
            <SliderRow label="Floor Position" value={Math.round(config.floorY * 100)} min={50} max={100} display={percent(config.floorY)} disabled={!config.floorEnabled} onChange={(value) => onChange({ floorY: value / 100 })} />
            <SliderRow label="Anim Duration" value={Math.round(config.animationDuration / 100) * 100} min={600} max={5000} step={100} display={`${(config.animationDuration / 1000).toFixed(1)}s`} onChange={(animationDuration) => onChange({ animationDuration })} />
          </div>
        )}
      </div>
    </SettingsSection>
  );
};
