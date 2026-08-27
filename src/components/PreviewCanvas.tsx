import React, { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { ShatterEngine } from '../engine/shatterEngine';
import { SVGInfo, ShatterConfig, GenerationStatus, PlaybackState, Point, ShatterFragment } from '../types/shatter';
import { GenerationProgress } from './GenerationProgress';
import type { DestructionExecutionConfig } from '../types/destructionStyle';
import { getRenderDpr } from '../runtime/renderLimits';
import { unlockAudioFromUserGesture } from '../engine/soundEngine';

interface PreviewCanvasProps {
  svgInfo: SVGInfo | null;
  config: ShatterConfig;
  execution: DestructionExecutionConfig;
  generationStatus: GenerationStatus;
  playbackState: PlaybackState;
  onStatusChange: (s: GenerationStatus) => void;
  onPlaybackChange: (s: PlaybackState) => void;
  onSeedChange: (seed: number) => void;
  onFragmentCountChange: (n: number) => void;
  onImpactPointChange?: (pt: Point) => void;
  onImpactRebuild?: (pt: Point) => Promise<void>;
  onError?: (message: string) => void;
}

export interface PreviewCanvasHandle {
  generate: (impactPoint?: Point) => Promise<void>;
  play: (impactPoint?: Point) => void;
  replay: () => void;
  reset: () => void;
  getSeed: () => number;
  getFragmentCount: () => number;
  getFragments: () => ShatterFragment[];
  getCanvas: () => HTMLCanvasElement | null;
  getImpactPoint: () => Point;
}

export const PreviewCanvas = forwardRef<PreviewCanvasHandle, PreviewCanvasProps>(({
  svgInfo,
  config,
  execution,
  generationStatus,
  playbackState,
  onStatusChange,
  onPlaybackChange,
  onSeedChange,
  onFragmentCountChange,
  onImpactPointChange,
  onImpactRebuild,
  onError,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShatterEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPointerOverVisible, setIsPointerOverVisible] = useState(false);
  const choosingImpact = config.impactMode === 'choose';

  // Init / destroy engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new ShatterEngine(canvas, config, execution);
    engineRef.current = engine;

    engine.onStatusChange = onStatusChange;
    engine.onPlaybackChange = onPlaybackChange;

    // Resize canvas to match container — wrapped in rAF to avoid Safari ResizeObserver loop error
    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const container = containerRef.current;
        if (!container || !canvas) return;
        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        const dpr = getRenderDpr();
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        engine.resize();
      });
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update config on engine
  useEffect(() => {
    engineRef.current?.updateConfig(config, execution);
  }, [config, execution]);

  // Load SVG when it changes
  useEffect(() => {
    if (!svgInfo || !engineRef.current) return;
    let cancelled = false;
    onStatusChange('analysing');
    engineRef.current.loadSVG(svgInfo).then(() => {
      if (!cancelled) onStatusChange('idle');
    }).catch(err => {
      if (cancelled || err?.name === 'AbortError') return;
      onError?.(err instanceof Error ? err.message : 'Failed to load SVG');
      onStatusChange('idle');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgInfo]);

  // Expose imperative handle to parent
  useImperativeHandle(ref, () => ({
    generate: async (impactPoint?: Point) => {
      if (!engineRef.current) return;
      try {
        await engineRef.current.generate(impactPoint);
        onSeedChange(engineRef.current.getSeed());
        onFragmentCountChange(engineRef.current.getFragmentCount());
      } catch (e) {
        onStatusChange('idle');
        throw e;
      }
    },
    play: (impactPoint?: Point) => {
      engineRef.current?.play(impactPoint);
    },
    replay: () => {
      engineRef.current?.replay();
    },
    reset: () => {
      engineRef.current?.reset();
    },
    getSeed: () => engineRef.current?.getSeed() ?? 0,
    getFragmentCount: () => engineRef.current?.getFragmentCount() ?? 0,
    getFragments: () => engineRef.current?.getFragments() ?? [],
    getCanvas: () => canvasRef.current,
    getImpactPoint: () => engineRef.current?.getImpactPoint() ?? { x: 0, y: 0 },
  }), [onSeedChange, onFragmentCountChange, onStatusChange]);

  // Click / tap on canvas → play or choose impact
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine || generationStatus !== 'ready' || playbackState === 'playing') return;

    const impactPoint = engine.hitTestVisibleSource(e.clientX, e.clientY);
    if (!impactPoint) return;

    unlockAudioFromUserGesture();
    setIsPointerOverVisible(false);
    onImpactPointChange?.(impactPoint);

    if (onImpactRebuild) void onImpactRebuild(impactPoint);
    else engine.play(impactPoint);
  }, [generationStatus, playbackState, onImpactPointChange, onImpactRebuild]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (generationStatus !== 'ready' || playbackState === 'playing') return;
    if (engineRef.current?.hitTestVisibleSource(e.clientX, e.clientY)) {
      unlockAudioFromUserGesture();
    }
  }, [generationStatus, playbackState]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canShatter = generationStatus === 'ready' && playbackState !== 'playing';
    setIsPointerOverVisible(
      canShatter && !!engineRef.current?.hitTestVisibleSource(e.clientX, e.clientY),
    );
  }, [generationStatus, playbackState]);

  const isGenerating = !['idle', 'ready'].includes(generationStatus);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
    >
      {/* Empty state */}
      {!svgInfo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-surface-700 border border-surface-500 flex items-center justify-center mb-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 24 L16 8 L24 24" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 19 L21 19" stroke="#4b5563" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="16" cy="27" r="1.5" fill="#4b5563"/>
            </svg>
          </div>
          <div>
            <p className="text-base font-medium text-gray-400">Drop an SVG to turn it into a breakable animation.</p>
            <p className="text-sm text-gray-600 mt-1">Your file stays in your browser.</p>
          </div>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerLeave={() => setIsPointerOverVisible(false)}
        onClick={handleCanvasClick}
        className={`w-full h-full ${isPointerOverVisible ? 'cursor-pointer' : 'cursor-default'}`}
        aria-label="SVG Shatter preview canvas"
      />

      {/* Progress overlay */}
      {isGenerating && <GenerationProgress status={generationStatus} />}

      {/* Choose impact hint */}
      {choosingImpact && generationStatus === 'ready' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-700/90 backdrop-blur px-3 py-1.5 rounded-full text-xs text-gray-300 pointer-events-none border border-surface-500">
          Click on the image to set impact point
        </div>
      )}
    </div>
  );
});

PreviewCanvas.displayName = 'PreviewCanvas';
