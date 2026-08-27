import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  DestructionStylePreset,
  GlobalShatterConfig,
  PhysicalStyleConfig,
  StyleSpecificConfig,
  StylizedWhispConfig,
} from '../types/destructionStyle';
import { PhysicalSettings } from './PhysicalSettings';
import { StylizedWhispSettings } from './StylizedWhispSettings';
import { RadioGroup, SettingsSection, SliderRow, ToggleRow } from './SettingsControls';
import { createRandomSeed } from '../engine/fractureGenerator';

interface ShatterSettingsProps {
  preset: DestructionStylePreset;
  globalConfig: GlobalShatterConfig;
  styleConfig: StyleSpecificConfig;
  onGlobalChange: (patch: Partial<GlobalShatterConfig>) => void;
  onPhysicalChange: (patch: Partial<Omit<PhysicalStyleConfig, 'kind'>>) => void;
  onStylizedChange: (config: StylizedWhispConfig) => void;
}

export const ShatterSettings: React.FC<ShatterSettingsProps> = ({
  preset,
  globalConfig,
  styleConfig,
  onGlobalChange,
  onPhysicalChange,
  onStylizedChange,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customSoundName, setCustomSoundName] = useState<string | null>(null);
  const [customSoundError, setCustomSoundError] = useState<string | null>(null);
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <div className="space-y-5">
      <SettingsSection title="Global">
        <RadioGroup label="Background" value={globalConfig.background} options={[
          { value: 'transparent', label: 'Transparent' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' },
        ]} onChange={(background) => onGlobalChange({ background })} />

        <ToggleRow label="Sound" checked={globalConfig.sound} onChange={(sound) => onGlobalChange({ sound })} />
        {globalConfig.sound && (
          <div className="pl-2 border-l border-surface-600 space-y-3">
            <RadioGroup label="Sound Source" value={globalConfig.soundSource} options={[
              { value: 'procedural', label: 'Procedural' }, { value: 'custom', label: 'Custom' },
            ]} onChange={(soundSource) => onGlobalChange({ soundSource: soundSource as GlobalShatterConfig['soundSource'] })} />
            {globalConfig.soundSource === 'custom' && (
              <div className="space-y-2">
                <input type="file" accept="audio/mp3,audio/wav,audio/ogg"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      const { loadCustomSound } = await import('../engine/soundEngine');
                      await loadCustomSound(file);
                      setCustomSoundName(file.name);
                      setCustomSoundError(null);
                      onGlobalChange({ soundSource: 'custom' });
                    } catch {
                      setCustomSoundError('Could not decode this audio file.');
                    } finally {
                      event.target.value = '';
                    }
                  }}
                  className="block w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-surface-600 file:text-white hover:file:bg-surface-500" />
                {customSoundName && (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                    <span className="truncate">{customSoundName}</span>
                    <button type="button" className="text-gray-500 hover:text-red-300" onClick={async () => {
                      const { clearCustomSound } = await import('../engine/soundEngine');
                      clearCustomSound();
                      setCustomSoundName(null);
                      onGlobalChange({ soundSource: 'procedural' });
                    }}>Remove</button>
                  </div>
                )}
                {customSoundError && <p className="text-[11px] text-red-300">{customSoundError}</p>}
                <SliderRow label="Volume" value={Math.round(globalConfig.customSoundVolume * 100)} min={0} max={200}
                  display={percent(globalConfig.customSoundVolume)} onChange={(value) => onGlobalChange({ customSoundVolume: value / 100 })} />
              </div>
            )}
          </div>
        )}

        <RadioGroup label="Impact Point" value={globalConfig.impactMode} options={[
          { value: 'auto', label: 'Auto' }, { value: 'center', label: 'Center' }, { value: 'choose', label: 'Choose' },
        ]} onChange={(impactMode) => onGlobalChange({ impactMode: impactMode as GlobalShatterConfig['impactMode'] })} />

        <div className="border-t border-surface-600 pt-3">
          <button type="button" onClick={() => setAdvancedOpen(open => !open)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full">
            {advancedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Editor Advanced
          </button>
          {advancedOpen && (
            <div className="mt-3 space-y-3 pl-2 border-l border-surface-600">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Random Seed</label>
                  <span className="value-badge font-mono text-[10px]">{globalConfig.seed ?? 'auto'}</span>
                </div>
                <div className="flex gap-2">
                  <input type="number" value={globalConfig.seed ?? ''} placeholder="auto"
                    className="flex-1 bg-surface-600 border border-surface-400 rounded px-2 py-1 text-xs text-white font-mono"
                    onChange={(event) => onGlobalChange({ seed: event.target.value ? parseInt(event.target.value) : undefined })} />
                  <button type="button" className="btn-ghost text-xs px-2 py-1"
                    onClick={() => onGlobalChange({ seed: createRandomSeed() })}>🎲</button>
                </div>
              </div>
              <SliderRow label="Export FPS" value={globalConfig.exportFps} min={12} max={60} step={6}
                onChange={(exportFps) => onGlobalChange({ exportFps })} />
            </div>
          )}
        </div>
      </SettingsSection>

      {preset.capabilities.physicalSettings && styleConfig.kind === 'physical' && (
        <PhysicalSettings config={styleConfig} onChange={onPhysicalChange} />
      )}
      {preset.capabilities.strikeSettings && styleConfig.kind === 'stylized-whisp' && (
        <StylizedWhispSettings config={styleConfig} soundEnabled={globalConfig.sound} onChange={onStylizedChange} />
      )}
    </div>
  );
};
