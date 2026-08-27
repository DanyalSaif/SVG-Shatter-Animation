import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Zap, FolderOpen, Save, AlertCircle, X } from 'lucide-react';
import { UploadPanel } from './components/UploadPanel';
import { PreviewCanvas, PreviewCanvasHandle } from './components/PreviewCanvas';
import { ShatterSettings } from './components/ShatterSettings';
import { DestructionStyleSelector } from './components/DestructionStyleSelector';
import { PlaybackControls } from './components/PlaybackControls';
import { ResultPanel } from './components/ResultPanel';
import { ExportModal } from './components/ExportModal';
import { SVGInfo, GenerationStatus, PlaybackState, ShatterFragment, Point } from './types/shatter';
import type { DestructionStyleId, GlobalShatterConfig, PhysicalStyleConfig, StylizedWhispConfig } from './types/destructionStyle';
import { getDefaultGlobalConfig, getDefaultStyleConfig, getDestructionStylePreset, isStyleConfigModified, resolveStyleConfig, resolveStyleExecution } from './presets/registry';
import {
  classifyGlobalChange,
  classifyImpactPointChange,
  classifyPhysicalChange,
  classifyPhysicalConfigChange,
  classifySourceChange,
  classifyStyleChange,
  classifyStylizedChange,
  type ConfigChangeEffect,
} from './config/changeEffects';
import { createRandomSeed } from './engine/fractureGenerator';
import { unlockAudioFromUserGesture } from './engine/soundEngine';

const DEFAULT_STYLE: DestructionStyleId = 'physical';

export default function App() {
  const [destructionStyle, setDestructionStyle] = useState<DestructionStyleId>(DEFAULT_STYLE);
  const [globalConfig, setGlobalConfig] = useState(() => getDefaultGlobalConfig(DEFAULT_STYLE));
  const [styleConfig, setStyleConfig] = useState(() => getDefaultStyleConfig(DEFAULT_STYLE));
  const [svgInfo, setSvgInfo] = useState<SVGInfo | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [seed, setSeed] = useState(0);
  const [fragmentCount, setFragmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [fragments, setFragments] = useState<ShatterFragment[]>([]);
  const [impactPoint, setImpactPoint] = useState<Point>({ x: 200, y: 200 });
  const [generatedStyle, setGeneratedStyle] = useState<DestructionStyleId | null>(null);

  const canvasRef = useRef<PreviewCanvasHandle>(null);
  const pendingActionRef = useRef<number | null>(null);
  const actionVersionRef = useRef(0);
  const sourceBlobUrlRef = useRef<string | null>(null);
  const selectedPreset = useMemo(() => getDestructionStylePreset(destructionStyle), [destructionStyle]);
  const config = useMemo(
    () => resolveStyleConfig(destructionStyle, globalConfig, styleConfig),
    [destructionStyle, globalConfig, styleConfig],
  );
  const execution = useMemo(
    () => resolveStyleExecution(destructionStyle, styleConfig, config),
    [destructionStyle, styleConfig, config],
  );
  const isStyleModified = useMemo(
    () => isStyleConfigModified(destructionStyle, styleConfig),
    [destructionStyle, styleConfig],
  );

  const cancelScheduledAction = useCallback(() => {
    actionVersionRef.current++;
    if (pendingActionRef.current !== null) window.clearTimeout(pendingActionRef.current);
    pendingActionRef.current = null;
  }, []);

  const scheduleAction = useCallback((action: () => void | Promise<void>, delay = 50) => {
    cancelScheduledAction();
    const version = actionVersionRef.current;
    pendingActionRef.current = window.setTimeout(async () => {
      pendingActionRef.current = null;
      if (version !== actionVersionRef.current) return;
      await action();
    }, delay);
  }, [cancelScheduledAction]);

  useEffect(() => () => cancelScheduledAction(), [cancelScheduledAction]);
  useEffect(() => () => {
    if (sourceBlobUrlRef.current) URL.revokeObjectURL(sourceBlobUrlRef.current);
  }, []);

  const handleUpload = useCallback((info: SVGInfo) => {
    cancelScheduledAction();
    if (sourceBlobUrlRef.current) URL.revokeObjectURL(sourceBlobUrlRef.current);
    sourceBlobUrlRef.current = info.blobUrl;
    classifySourceChange();
    setSvgInfo(info);
    setDestructionStyle(DEFAULT_STYLE);
    setGlobalConfig(getDefaultGlobalConfig(DEFAULT_STYLE));
    setStyleConfig(getDefaultStyleConfig(DEFAULT_STYLE));
    setGenerationStatus('idle');
    setPlaybackState('idle');
    setSeed(0);
    setFragmentCount(0);
    setFragments([]);
    setGeneratedStyle(null);
    setError(null);
  }, [cancelScheduledAction]);

  const applyReadyChange = useCallback((effect: ConfigChangeEffect, point?: Point) => {
    if (generationStatus !== 'ready' || !svgInfo) return;
    if (effect === 'replay') {
      scheduleAction(() => canvasRef.current?.replay());
      return;
    }
    if (effect === 'rebuild-fracture') {
      setError(null);
      setGeneratedStyle(destructionStyle);
      scheduleAction(async () => {
        try {
          await canvasRef.current?.generate(point);
          setFragments(canvasRef.current?.getFragments() ?? []);
          setImpactPoint(canvasRef.current?.getImpactPoint() ?? point ?? impactPoint);
        } catch (error) {
          if (!isAbortError(error)) setError(error instanceof Error ? error.message : 'Generation failed');
        }
      });
    }
  }, [destructionStyle, generationStatus, impactPoint, scheduleAction, svgInfo]);

  const handleStyleSelect = useCallback((style: DestructionStyleId) => {
    if (style === destructionStyle) return;
    const effect = classifyStyleChange();
    const hadResult = generationStatus === 'ready';
    canvasRef.current?.reset();
    setDestructionStyle(style);
    setStyleConfig(getDefaultStyleConfig(style));
    setPlaybackState('idle');
    setShowExport(false);
    setError(null);
    if (hadResult && effect === 'rebuild-fracture') {
      scheduleAction(async () => {
        try {
          await canvasRef.current?.generate();
          setFragments(canvasRef.current?.getFragments() ?? []);
          setGeneratedStyle(style);
        } catch (error) {
          if (!isAbortError(error)) setError(error instanceof Error ? error.message : 'Generation failed');
        }
      });
    } else {
      setGenerationStatus('idle');
      setSeed(0);
      setFragmentCount(0);
      setFragments([]);
      setGeneratedStyle(null);
    }
  }, [destructionStyle, generationStatus, scheduleAction]);

  const handleGlobalChange = useCallback((patch: Partial<GlobalShatterConfig>) => {
    setGlobalConfig(current => ({ ...current, ...patch }));
    if (Object.keys(patch).every(key => key === 'exportFps')) return;
    applyReadyChange(classifyGlobalChange(patch));
  }, [applyReadyChange]);

  const handlePhysicalChange = useCallback((patch: Partial<Omit<PhysicalStyleConfig, 'kind'>>) => {
    setStyleConfig(current => current.kind === 'physical' ? { ...current, ...patch } : current);
    applyReadyChange(classifyPhysicalChange(patch));
  }, [applyReadyChange]);

  const handleStylizedChange = useCallback((nextConfig: StylizedWhispConfig) => {
    const effect = styleConfig.kind === 'stylized-whisp'
      ? classifyStylizedChange(styleConfig, nextConfig)
      : 'rebuild-fracture';
    setStyleConfig(nextConfig);
    applyReadyChange(effect);
  }, [applyReadyChange, styleConfig]);

  const handleResetStyle = useCallback(() => {
    const defaults = getDefaultStyleConfig(destructionStyle);
    const effect = styleConfig.kind === 'stylized-whisp' && defaults.kind === 'stylized-whisp'
      ? classifyStylizedChange(styleConfig, defaults)
      : styleConfig.kind === 'physical' && defaults.kind === 'physical'
        ? classifyPhysicalConfigChange(styleConfig, defaults)
        : 'rebuild-fracture';
    setStyleConfig(defaults);
    applyReadyChange(effect);
  }, [applyReadyChange, destructionStyle, styleConfig]);

  const handleImpactRebuild = useCallback(async (point: Point) => {
    classifyImpactPointChange();
    setImpactPoint(point);
    setError(null);
    setGeneratedStyle(destructionStyle);
    try {
      await canvasRef.current?.generate(point);
      setFragments(canvasRef.current?.getFragments() ?? []);
      const resolvedPoint = canvasRef.current?.getImpactPoint() ?? point;
      setImpactPoint(resolvedPoint);
      canvasRef.current?.play(resolvedPoint);
    } catch (error) {
      if (!isAbortError(error)) setError(error instanceof Error ? error.message : 'Generation failed');
    }
  }, [destructionStyle]);

  const handleError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!svgInfo) return;
    setError(null);
    setGeneratedStyle(destructionStyle);
    try {
      await canvasRef.current?.generate();
      const frags = canvasRef.current?.getFragments() ?? [];
      setFragments(frags);
      setImpactPoint(canvasRef.current?.getImpactPoint() ?? { x: svgInfo.width / 2, y: svgInfo.height / 2 });
    } catch (e: any) {
      if (isAbortError(e)) return;
      setGeneratedStyle(null);
      setError(e?.message || 'Generation failed');
      setGenerationStatus('idle');
    }
  }, [svgInfo, destructionStyle]);

  const handleRegenerate = useCallback(async () => {
    if (!svgInfo) return;
    setError(null);
    setGeneratedStyle(destructionStyle);
    // New random seed
    setGlobalConfig(current => ({ ...current, seed: createRandomSeed() }));
    scheduleAction(async () => {
      try {
        await canvasRef.current?.generate();
        const frags = canvasRef.current?.getFragments() ?? [];
        setFragments(frags);
        setImpactPoint(canvasRef.current?.getImpactPoint() ?? impactPoint);
      } catch (e: any) {
        if (isAbortError(e)) return;
        setGeneratedStyle(null);
        setError(e?.message || 'Generation failed');
      }
    });
  }, [svgInfo, destructionStyle, impactPoint, scheduleAction]);

  const isGenerating = !['idle', 'ready'].includes(generationStatus);
  const hasResult = generationStatus === 'ready' && generatedStyle === destructionStyle;
  const resultStatus: GenerationStatus = generatedStyle === destructionStyle ? generationStatus : 'idle';

  const canvasW = svgInfo?.width ?? 800;
  const canvasH = svgInfo?.height ?? 600;

  return (
    <div className="flex flex-col h-screen bg-surface-900 text-gray-200 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-surface-700 flex-shrink-0 bg-surface-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-sm text-white tracking-tight">SVG Shatter Studio</span>
        </div>

        <div className="flex items-center gap-1">
          <button className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 px-3">
            <FolderOpen size={13} />
            Open
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 px-3">
            <Save size={13} />
            Save
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2 text-sm flex-shrink-0">
          <AlertCircle size={14} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-100">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT – Settings */}
        <aside className="w-72 flex-shrink-0 border-r border-surface-700 flex flex-col overflow-y-auto bg-surface-800">
          <div className="p-4 space-y-5">
            {/* Upload section */}
            <div>
              <div className="section-title">Source SVG</div>
              <UploadPanel
                svgInfo={svgInfo}
                onUpload={handleUpload}
                onError={handleError}
              />
            </div>

            {/* Settings section */}
            {svgInfo && (
              <div>
                <div className="section-title">Animation Style</div>
                <DestructionStyleSelector
                  selectedStyle={destructionStyle}
                  onSelect={handleStyleSelect}
                  isModified={isStyleModified}
                  onResetStyle={handleResetStyle}
                />
              </div>
            )}

            {svgInfo && (
              <div>
                <div className="section-title">Settings</div>
                <ShatterSettings
                  preset={selectedPreset}
                  globalConfig={globalConfig}
                  styleConfig={styleConfig}
                  onGlobalChange={handleGlobalChange}
                  onPhysicalChange={handlePhysicalChange}
                  onStylizedChange={handleStylizedChange}
                />
              </div>
            )}
          </div>

          {/* Generate button – sticky at bottom of left panel */}
          {svgInfo && (
            <div className="mt-auto p-4 border-t border-surface-700">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm"
              >
                <Zap size={16} />
                {isGenerating ? 'Generating…' : 'Generate Shatter'}
              </button>
            </div>
          )}
        </aside>

        {/* CENTER – Preview */}
        <main className="flex-1 flex flex-col overflow-hidden bg-surface-900">
          {/* Canvas area */}
          <div className="flex-1 relative p-4">
            <div
              className="w-full h-full rounded-xl overflow-hidden border border-surface-700"
              style={{
                backgroundColor: config.background === 'dark' ? '#111118'
                  : config.background === 'light' ? '#f3f4f6'
                  : config.background.startsWith('#') ? config.background
                  : '#111118',
                backgroundImage: (!svgInfo || config.background === 'transparent')
                  ? 'linear-gradient(45deg, #1a1a22 25%, transparent 25%), linear-gradient(-45deg, #1a1a22 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a22 75%), linear-gradient(-45deg, transparent 75%, #1a1a22 75%)'
                  : undefined,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              }}
            >
              <PreviewCanvas
                ref={canvasRef}
                svgInfo={svgInfo}
                config={config}
                execution={execution}
                generationStatus={generationStatus}
                playbackState={playbackState}
                onStatusChange={setGenerationStatus}
                onPlaybackChange={setPlaybackState}
                onSeedChange={setSeed}
                onFragmentCountChange={setFragmentCount}
                onImpactPointChange={setImpactPoint}
                onImpactRebuild={handleImpactRebuild}
                onError={handleError}
              />
            </div>
          </div>

          {/* Playback controls */}
          {hasResult && (
            <div className="flex-shrink-0 px-4 pb-4">
              <div className="panel px-4 py-3">
                <PlaybackControls
                  generationStatus={generationStatus}
                  playbackState={playbackState}
                  onPlay={() => {
                    unlockAudioFromUserGesture();
                    canvasRef.current?.play();
                  }}
                  onReplay={() => {
                    unlockAudioFromUserGesture();
                    canvasRef.current?.replay();
                  }}
                  onReset={() => canvasRef.current?.reset()}
                  onRegenerate={handleRegenerate}
                />
              </div>
            </div>
          )}
        </main>

        {/* RIGHT – Results */}
        <aside className="w-64 flex-shrink-0 border-l border-surface-700 overflow-y-auto bg-surface-800 p-4">
          <ResultPanel
            status={resultStatus}
            seed={seed}
            fragmentCount={fragmentCount}
            config={config}
            canvasWidth={canvasW}
            canvasHeight={canvasH}
            onDownload={() => setShowExport(true)}
          />
        </aside>
      </div>

      {/* Export Modal */}
      {showExport && svgInfo && (
        <ExportModal
          svgInfo={svgInfo}
          config={config}
          globalConfig={globalConfig}
          styleConfig={styleConfig}
          destructionStyle={destructionStyle}
          execution={execution}
          fragments={fragments}
          seed={seed}
          impactPoint={impactPoint}
          canvasWidth={canvasW}
          canvasHeight={canvasH}
          onClose={() => setShowExport(false)}
          previewCanvas={canvasRef.current?.getCanvas() ?? null}
        />
      )}
    </div>
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
