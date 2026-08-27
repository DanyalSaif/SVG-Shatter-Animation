import React from 'react';
import { GenerationStatus } from '../types/shatter';

const STAGES: { key: GenerationStatus; label: string }[] = [
  { key: 'analysing', label: 'Analysing SVG' },
  { key: 'fracturing', label: 'Generating Fracture' },
  { key: 'building', label: 'Building Fragments' },
  { key: 'physics', label: 'Preparing Physics' },
  { key: 'sound', label: 'Creating Sound' },
  { key: 'ready', label: 'Ready' },
];

interface GenerationProgressProps {
  status: GenerationStatus;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({ status }) => {
  if (status === 'idle' || status === 'ready') return null;

  const currentIndex = STAGES.findIndex(s => s.key === status);
  const progress = currentIndex >= 0 ? ((currentIndex + 1) / STAGES.length) * 100 : 0;
  const currentLabel = STAGES[currentIndex]?.label ?? 'Processing…';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-900/90 backdrop-blur-sm z-20 rounded-xl gap-4">
      <div className="space-y-2 w-56 text-center">
        <div className="text-sm font-medium text-white">{currentLabel}</div>
        <div className="relative h-1.5 bg-surface-500 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-300 progress-shimmer"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
          {STAGES.map((s, i) => (
            <span
              key={s.key}
              className={`text-[10px] transition-colors ${
                i < currentIndex ? 'text-accent' :
                i === currentIndex ? 'text-white font-medium' :
                'text-gray-600'
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
