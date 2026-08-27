import { Check, RotateCcw } from 'lucide-react';
import { DESTRUCTION_STYLE_PRESETS } from '../presets/registry';
import type { DestructionStyleId } from '../types/destructionStyle';

interface DestructionStyleSelectorProps {
  selectedStyle: DestructionStyleId;
  onSelect: (style: DestructionStyleId) => void;
  isModified: boolean;
  onResetStyle: () => void;
}

export const DestructionStyleSelector: React.FC<DestructionStyleSelectorProps> = ({ selectedStyle, onSelect, isModified, onResetStyle }) => (
  <div className="space-y-2">
    {DESTRUCTION_STYLE_PRESETS.map(preset => {
      const selected = preset.id === selectedStyle;
      return (
        <button key={preset.id} type="button" onClick={() => onSelect(preset.id)} aria-pressed={selected}
          className={`w-full text-left rounded-lg border p-3 transition-colors ${
            selected ? 'border-accent bg-accent/10' : 'border-surface-500 bg-surface-700 hover:border-accent/50'
          }`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-gray-300'}`}>
              {preset.name}{selected && isModified ? ' · Modified' : ''}
            </span>
            {selected && <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center flex-shrink-0"><Check size={12} className="text-white" /></span>}
          </div>
          <p className="text-[11px] leading-4 text-gray-500 mt-1 pr-2">{preset.description}</p>
        </button>
      );
    })}
    {isModified && (
      <button type="button" onClick={onResetStyle}
        className="btn-ghost w-full flex items-center justify-center gap-1.5 py-2 text-xs">
        <RotateCcw size={12} /> Reset Style
      </button>
    )}
  </div>
);
