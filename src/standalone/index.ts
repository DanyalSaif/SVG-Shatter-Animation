import { ShatterRuntime } from '../runtime/ShatterRuntime';
import type { PlaybackState, ShatterFragment } from '../types/shatter';
import { calculateResponsiveExportTransform } from '../runtime/StageTransform';
import { resolveStyleExecution } from '../presets/registry';
import { normalizeShatterConfig } from '../export/shatterV3';
import type { ShatterExportConfig } from '../export/shatterV3';
import { getRenderDpr } from '../runtime/renderLimits';
import { unlockAudioFromUserGesture } from '../engine/soundEngine';

export interface StandaloneCallbacks {
  onPlaybackChange?: (state: PlaybackState) => void;
  onComplete?: () => void;
}

export interface StandaloneHandle {
  runtime: ShatterRuntime;
  play: () => void;
  reset: () => void;
  destroy: () => void;
}

export async function initShatter(
  canvasId: string,
  input: ShatterExportConfig,
  callbacks: StandaloneCallbacks = {},
): Promise<StandaloneHandle> {
  const config = normalizeShatterConfig(input);
  validateConfig(config);

  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) throw new Error(`Canvas with id ${canvasId} not found`);
  const parent = canvas.parentElement;
  if (!parent) throw new Error('Canvas has no parent element');

  let lastStageWidth = 0;
  let lastStageHeight = 0;
  const setCanvasSize = () => {
    const aspect = config.output.aspectRatio || 16 / 9;
    const parentWidth = parent.clientWidth;
    const parentHeight = parent.clientHeight;
    const width = parentWidth / parentHeight >= aspect ? parentHeight * aspect : parentWidth;
    const height = parentWidth / parentHeight >= aspect ? parentHeight : parentWidth / aspect;
    if (width <= 0 || height <= 0) throw new Error('Invalid stage dimensions');
    const changed = Math.abs(width - lastStageWidth) > 0.5 || Math.abs(height - lastStageHeight) > 0.5;
    lastStageWidth = width;
    lastStageHeight = height;
    const dpr = getRenderDpr();
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    return {
      changed,
      transform: calculateResponsiveExportTransform(config.source.width, config.source.height, width, height),
    };
  };

  const initialStageTransform = setCanvasSize().transform;
  const svgImage = await loadImage(config.source.svgDataUrl);
  const fragments: ShatterFragment[] = await Promise.all(config.fragments.map(async serialized => {
    const image = await loadImage(serialized.textureDataUrl);
    const fragmentCanvas = document.createElement('canvas');
    fragmentCanvas.width = serialized.textureWidth;
    fragmentCanvas.height = serialized.textureHeight;
    fragmentCanvas.getContext('2d')!.drawImage(image, 0, 0);
    return {
      id: serialized.id,
      clipPolygon: serialized.clipPolygon,
      center: serialized.center,
      area: serialized.area,
      visibleArea: serialized.visibleArea,
      mass: serialized.mass,
      visibleCentroid: serialized.visibleCentroid,
      hullPolygon: serialized.hullPolygon,
      canvas: fragmentCanvas,
      textureScale: serialized.textureScale ?? 2,
      initialX: serialized.initialX,
      initialY: serialized.initialY,
      x: serialized.initialX,
      y: serialized.initialY,
      angle: 0,
      velocityX: 0,
      velocityY: 0,
      angularVelocity: 0,
      sizeClass: serialized.sizeClass,
      normalizedArea: serialized.normalizedArea,
      distanceFromImpact: serialized.distanceFromImpact,
      aspectRatio: serialized.aspectRatio,
    };
  }));
  validateFragments(fragments);

  if (config.physics.soundSource === 'custom' && config.audio.customSoundDataUrl) {
    const { loadCustomSoundFromUrl } = await import('../engine/soundEngine');
    await loadCustomSoundFromUrl(config.audio.customSoundDataUrl);
  }

  const resolvedExecution = resolveStyleExecution(config.destructionStyle, config.styleConfig, config.physics);
  const execution = {
    ...resolvedExecution,
    ...config.execution,
    timeline: { ...config.timeline },
  };
  let replayTimer: number | null = null;
  const hint = parent.querySelector<HTMLElement>('[data-shatter-hint]');
  const runtime = new ShatterRuntime({
    canvas,
    fragments,
    config: config.physics,
    svgWidth: config.source.width,
    svgHeight: config.source.height,
    seed: config.seed,
    svgImage,
    stageTransform: initialStageTransform,
    execution,
    resolvedObjectWeight: config.audio.resolvedObjectWeight,
    onPlaybackChange: state => {
      if (hint) {
        hint.style.opacity = state === 'playing' ? '0' : '1';
        if (state === 'settled') hint.textContent = 'Click to replay';
      }
      callbacks.onPlaybackChange?.(state);
    },
    onComplete: callbacks.onComplete,
  });

  const playRuntime = () => runtime.play(config.impact.point);
  const play = () => {
    unlockAudioFromUserGesture();
    playRuntime();
  };
  const reset = () => runtime.reset();
  const pointerDownHandler = () => unlockAudioFromUserGesture();
  const clickHandler = (event: MouseEvent) => {
    unlockAudioFromUserGesture();
    if (runtime.playbackState === 'playing') return;
    const clicked = runtime.canvasToSourceSpace(event.clientX, event.clientY);
    if (clicked.x < 0 || clicked.x > config.source.width || clicked.y < 0 || clicked.y > config.source.height) return;
    if (runtime.playbackState === 'settled') {
      runtime.reset();
      replayTimer = window.setTimeout(playRuntime, 50);
    } else {
      playRuntime();
    }
  };
  canvas.addEventListener('pointerdown', pointerDownHandler);
  canvas.addEventListener('click', clickHandler);
  runtime.reset();

  const resizeObserver = new ResizeObserver(() => {
    const resized = setCanvasSize();
    if (resized.changed) runtime.setStageTransform(resized.transform);
  });
  resizeObserver.observe(parent);

  return {
    runtime,
    play,
    reset,
    destroy: () => {
      if (replayTimer !== null) window.clearTimeout(replayTimer);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDownHandler);
      canvas.removeEventListener('click', clickHandler);
      runtime.destroy();
    },
  };
}

function validateConfig(config: ReturnType<typeof normalizeShatterConfig>) {
  if (!config.source.width || !config.source.height) throw new Error('Invalid source SVG dimensions');
  if (!config.fragments.length) throw new Error('No fragments provided');
}

function validateFragments(fragments: readonly ShatterFragment[]) {
  for (const fragment of fragments) {
    if (!Number.isFinite(fragment.visibleCentroid.x) || !Number.isFinite(fragment.visibleCentroid.y)) {
      throw new Error(`Fragment ${fragment.id} has invalid visibleCentroid`);
    }
    if (!Number.isFinite(fragment.visibleArea) || !Number.isFinite(fragment.mass)) {
      throw new Error(`Fragment ${fragment.id} has invalid physical metadata`);
    }
    if (!fragment.hullPolygon || fragment.hullPolygon.length < 3) {
      throw new Error(`Fragment ${fragment.id} has invalid hullPolygon`);
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load an exported image asset'));
    image.src = src;
  });
}
