import React from 'react';
import { Download, Hash, Clock, Layers, Speaker, Monitor } from 'lucide-react';
import { GenerationStatus, ShatterConfig } from '../types/shatter';

interface ResultPanelProps {
  status: GenerationStatus;
  seed: number;
  fragmentCount: number;
  config: ShatterConfig;
  canvasWidth: number;
  canvasHeight: number;
  onDownload: () => void;
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between py-2 border-b border-surface-700 last:border-0">
    <div className="flex items-center gap-2 text-gray-500">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
    <span className="text-xs font-mono text-gray-300">{value}</span>
  </div>
);

export const ResultPanel: React.FC<ResultPanelProps> = ({
  status,
  seed,
  fragmentCount,
  config,
  canvasWidth,
  canvasHeight,
  onDownload,
}) => {
  const isReady = status === 'ready';

  if (!isReady) {
    return (
      <div className="space-y-4">
        <div className="section-title">Result</div>
        <div className="panel p-4 space-y-2">
          <p className="text-xs text-gray-600 text-center py-4">
            Generate a shatter to see result info
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="section-title">Result</div>

      <div className="panel p-3 divide-y divide-surface-700">
        <InfoRow icon={<Layers size={13} />} label="Fragments" value={String(fragmentCount)} />
        <InfoRow icon={<Clock size={13} />} label="Duration" value={`${(config.animationDuration / 1000).toFixed(1)}s`} />
        <InfoRow icon={<Hash size={13} />} label="Seed" value={String(seed)} />
        <InfoRow icon={<Monitor size={13} />} label="Canvas" value={`${canvasWidth} × ${canvasHeight}`} />
        <InfoRow icon={<Speaker size={13} />} label="Sound" value={config.sound ? 'Procedural' : 'Off'} />
        <InfoRow icon={<Layers size={13} />} label="Physics" value="Matter.js" />
      </div>

      <button
        onClick={onDownload}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        <Download size={16} />
        Download / Export
      </button>

      <p className="text-[10px] text-gray-600 text-center">
        Files stay in your browser — nothing is uploaded.
      </p>
    </div>
  );
};
