import type { ObjectWeight, StrikeDirection, StylizedWhispConfig, VisualStyleId } from '../types/destructionStyle';
import { RadioGroup, SettingsSection, SliderRow, ToggleRow } from './SettingsControls';

interface StylizedWhispSettingsProps {
  config: StylizedWhispConfig;
  soundEnabled: boolean;
  onChange: (config: StylizedWhispConfig) => void;
}

export const StylizedWhispSettings: React.FC<StylizedWhispSettingsProps> = ({ config, soundEnabled, onChange }) => {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const updateStrike = (patch: Partial<StylizedWhispConfig['strike']>) => onChange({ ...config, strike: { ...config.strike, ...patch } });
  const updateFracture = (patch: Partial<StylizedWhispConfig['fracture']>) => onChange({ ...config, fracture: { ...config.fracture, ...patch } });
  const updateExtinction = (patch: Partial<StylizedWhispConfig['extinction']>) => onChange({ ...config, extinction: { ...config.extinction, ...patch } });
  const updateSmoke = (patch: Partial<StylizedWhispConfig['smoke']>) => onChange({ ...config, smoke: { ...config.smoke, ...patch } });
  const updateWhisp = (patch: Partial<StylizedWhispConfig['whisp']>) => onChange({ ...config, whisp: { ...config.whisp, ...patch } });
  const updateAudio = (patch: Partial<StylizedWhispConfig['audio']>) => onChange({ ...config, audio: { ...config.audio, ...patch } });
  const updateAppearance = (patch: Partial<StylizedWhispConfig['appearance']>) => onChange({ ...config, appearance: { ...config.appearance, ...patch } });

  return (
    <div className="space-y-5">
      <SettingsSection title="Strike">
        <RadioGroup label="Strike Direction" value={config.strike.direction} options={[
          { value: 'left-to-right', label: 'Left → Right' },
          { value: 'right-to-left', label: 'Right → Left' },
          { value: 'rising-diagonal', label: 'Rising' },
          { value: 'falling-diagonal', label: 'Falling' },
          { value: 'downward', label: 'Down' },
        ]} onChange={(direction) => updateStrike({ direction: direction as StrikeDirection })} />
        <SliderRow label="Strike Angle" value={config.strike.angle} min={0} max={90} display={`${config.strike.angle}°`} onChange={(angle) => updateStrike({ angle })} />
        <ToggleRow label="Show Slash" checked={config.strike.visible} onChange={(visible) => updateStrike({ visible })} />
      </SettingsSection>

      <SettingsSection title="Break">
        <SliderRow label="Fragments" value={config.fracture.fragmentCount} min={6} max={40} onChange={(fragmentCount) => updateFracture({ fragmentCount })} />
        <SliderRow label="Spread" value={Math.round(config.fracture.spread * 100)} min={0} max={100} display={percent(config.fracture.spread)} onChange={(value) => updateFracture({ spread: value / 100 })} />
        <SliderRow label="Force" value={Math.round(config.fracture.force * 100)} min={0} max={100} display={percent(config.fracture.force)} onChange={(value) => updateFracture({ force: value / 100 })} />
        <SliderRow label="Rotation" value={Math.round(config.fracture.rotation * 100)} min={0} max={100} display={percent(config.fracture.rotation)} onChange={(value) => updateFracture({ rotation: value / 100 })} />
      </SettingsSection>

      <SettingsSection title="Extinction">
        <SliderRow label="Shard Lifetime" value={config.extinction.shardLifetime} min={150} max={600} step={25} display={`${config.extinction.shardLifetime}ms`} onChange={(shardLifetime) => updateExtinction({ shardLifetime })} />
        <SliderRow label="Fade" value={Math.round(config.extinction.fadeAmount * 100)} min={0} max={100} display={percent(config.extinction.fadeAmount)} onChange={(value) => updateExtinction({ fadeAmount: value / 100 })} />
        <SliderRow label="Extinction Speed" value={Math.round(config.extinction.speed * 100)} min={0} max={100} display={percent(config.extinction.speed)} onChange={(value) => updateExtinction({ speed: value / 100 })} />
      </SettingsSection>

      <SettingsSection title="Smoke">
        <SliderRow label="Turns Into Smoke" value={Math.round(config.smoke.shardAmount * 100)} min={0} max={100} display={percent(config.smoke.shardAmount)} onChange={(value) => updateSmoke({ shardAmount: value / 100 })} />
        <SliderRow label="Smoke Conversion" value={Math.round(config.smoke.shardConversionSpeed * 100)} min={0} max={100} display={percent(config.smoke.shardConversionSpeed)} onChange={(value) => updateSmoke({ shardConversionSpeed: value / 100 })} />
        <SliderRow label="Central Smoke" value={Math.round(config.smoke.centralAmount * 100)} min={0} max={100} display={percent(config.smoke.centralAmount)} onChange={(value) => updateSmoke({ centralAmount: value / 100 })} />
        <SliderRow label="Central Dissolve" value={Math.round(config.smoke.centralConversionSpeed * 100)} min={0} max={100} display={percent(config.smoke.centralConversionSpeed)} onChange={(value) => updateSmoke({ centralConversionSpeed: value / 100 })} />
      </SettingsSection>

      <SettingsSection title="Whisp">
        <SliderRow label="Whisp Amount" value={Math.round(config.whisp.whispAmount * 100)} min={0} max={100} display={percent(config.whisp.whispAmount)} onChange={(value) => updateWhisp({ whispAmount: value / 100 })} />
        <SliderRow label="Whisp Length" value={Math.round(config.whisp.whispLength * 100)} min={0} max={100} display={percent(config.whisp.whispLength)} onChange={(value) => updateWhisp({ whispLength: value / 100 })} />
        <SliderRow label="Curl" value={Math.round(config.whisp.curl * 100)} min={0} max={100} display={percent(config.whisp.curl)} onChange={(value) => updateWhisp({ curl: value / 100 })} />
        <SliderRow label="Rise" value={Math.round(config.whisp.rise * 100)} min={0} max={100} display={percent(config.whisp.rise)} onChange={(value) => updateWhisp({ rise: value / 100 })} />
      </SettingsSection>

      <SettingsSection title="Stylized Audio" muted={!soundEnabled}>
        <RadioGroup label="Object Weight" value={config.audio.objectWeight} disabled={!soundEnabled} options={[
          { value: 'auto', label: 'Auto' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' }, { value: 'heavy', label: 'Heavy' },
        ]} onChange={(objectWeight) => updateAudio({ objectWeight: objectWeight as ObjectWeight })} />
        <SliderRow label="Impact Weight" value={Math.round(config.audio.impactWeight * 100)} min={0} max={100} display={percent(config.audio.impactWeight)} disabled={!soundEnabled} onChange={(value) => updateAudio({ impactWeight: value / 100 })} />
        <SliderRow label="Debris" value={Math.round(config.audio.debrisLevel * 100)} min={0} max={100} display={percent(config.audio.debrisLevel)} disabled={!soundEnabled} onChange={(value) => updateAudio({ debrisLevel: value / 100 })} />
        <SliderRow label="Whisp" value={Math.round(config.audio.whispLevel * 100)} min={0} max={100} display={percent(config.audio.whispLevel)} disabled={!soundEnabled} onChange={(value) => updateAudio({ whispLevel: value / 100 })} />
      </SettingsSection>

      <SettingsSection title="Appearance">
        <RadioGroup label="Visual Style" value={config.appearance.visualStyle} options={[
          { value: 'stylized', label: 'Stylized' },
          { value: 'cel-shaded', label: 'Cel Shaded' },
        ]} onChange={(visualStyle) => updateAppearance({ visualStyle: visualStyle as VisualStyleId })} />
      </SettingsSection>
    </div>
  );
};
