import React from 'react';
import { Play, RotateCcw, RefreshCw, Repeat } from 'lucide-react';
import { PlaybackState, GenerationStatus } from '../types/shatter';

interface PlaybackControlsProps {
  generationStatus: GenerationStatus;
  playbackState: PlaybackState;
  onPlay: () => void;
  onReplay: () => void;
  onReset: () => void;
  onRegenerate: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  generationStatus,
  playbackState,
  onPlay,
  onReplay,
  onReset,
  onRegenerate,
}) => {
  const isReady = generationStatus === 'ready';
  const isPlaying = playbackState === 'playing';

  return (
    <div className="flex items-center gap-2 justify-center">
      {/* Main play button */}
      <button
        onClick={onPlay}
        disabled={!isReady || isPlaying}
        className="btn-primary flex items-center gap-2 px-6 py-2.5"
        title="Play animation (or click on the SVG)"
      >
        <Play size={16} fill="currentColor" />
        {isPlaying ? 'Playing…' : 'Play'}
      </button>

      <button
        onClick={onReplay}
        disabled={!isReady || isPlaying}
        className="btn-secondary flex items-center gap-2"
        title="Replay same fracture"
      >
        <Repeat size={15} />
        Replay
      </button>

      <button
        onClick={onReset}
        disabled={!isReady}
        className="btn-secondary flex items-center gap-2"
        title="Reset to intact"
      >
        <RotateCcw size={15} />
        Reset
      </button>

      <button
        onClick={onRegenerate}
        disabled={isPlaying}
        className="btn-secondary flex items-center gap-2"
        title="New fracture pattern"
      >
        <RefreshCw size={15} />
        Regenerate
      </button>
    </div>
  );
};
