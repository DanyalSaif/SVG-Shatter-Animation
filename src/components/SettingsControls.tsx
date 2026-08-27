import type { ReactNode } from 'react';

export const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, display, disabled = false, onChange }) => (
  <div className={`space-y-1.5 ${disabled ? 'opacity-45' : ''}`}>
    <div className="flex items-center justify-between">
      <label className="text-xs text-gray-400">{label}</label>
      <span className="value-badge">{display ?? value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={(event) => onChange(parseFloat(event.target.value))}
      className="w-full disabled:cursor-not-allowed" aria-label={label} />
  </div>
);

export const RadioGroup: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}> = ({ label, value, options, disabled = false, onChange }) => (
  <div className={`space-y-1.5 ${disabled ? 'opacity-45' : ''}`}>
    <span className="text-xs text-gray-400">{label}</span>
    <div className="flex flex-wrap gap-1">
      {options.map(option => (
        <button key={option.value} type="button" disabled={disabled} onClick={() => onChange(option.value)}
          className={`text-xs px-2.5 py-1 rounded-md border transition-all disabled:cursor-not-allowed ${
            value === option.value ? 'bg-accent border-accent text-white' : 'bg-surface-600 border-surface-400 text-gray-400 hover:border-accent/50'
          }`}>
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

export const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, disabled = false, onChange }) => (
  <div className={`flex items-center justify-between ${disabled ? 'opacity-45' : ''}`}>
    <span className="text-xs text-gray-400">{label}</span>
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors disabled:cursor-not-allowed ${checked ? 'bg-accent' : 'bg-surface-400'}`}
      aria-label={label} aria-pressed={checked}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
);

export const SettingsSection: React.FC<{ title: string; children: ReactNode; muted?: boolean }> = ({ title, children, muted = false }) => (
  <section className={`space-y-3 ${muted ? 'opacity-60' : ''}`}>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{title}</div>
    {children}
  </section>
);
