import { ShatterConfig, ShatterFragment, SVGInfo, Point, GenerationStatus, PlaybackState } from '../types/shatter';
import {
  rasterizeSVG,
  buildAlphaMask,
  getVisibleBounds,
  hasVisiblePixels,
  isVisibleSourcePoint,
  resolveVisibleImpactPoint,
} from './alphaMask';
import { createRandomSeed, generateFracture } from './fractureGenerator';
import { buildFragments } from './fragmentBuilder';
import { ShatterRuntime } from '../runtime/ShatterRuntime';
import type { DestructionExecutionConfig } from '../types/destructionStyle';
import { createPhysicalExecution } from '../runtime/ShatterTimeline';
import { getSourceRasterScale } from '../runtime/renderLimits';

export interface ShatterPerformanceMetrics {
  imageLoadMs: number;
  rasterizeMs: number;
  alphaMaskMs: number;
  fractureMs: number;
  fragmentBuildMs: number;
  runtimeSetupMs: number;
}

export class ShatterEngine {
  private canvas: HTMLCanvasElement;
  private config: ShatterConfig;
  private execution: DestructionExecutionConfig;
  private svgInfo: SVGInfo | null = null;
  private mask: Uint8Array | null = null;
  private maskWidth = 0;
  private maskHeight = 0;
  private rasterCanvas: HTMLCanvasElement | null = null;
  private rasterScale = 2;
  private svgImage: HTMLImageElement | null = null;
  private operationVersion = 0;
  private performanceMetrics: ShatterPerformanceMetrics = {
    imageLoadMs: 0,
    rasterizeMs: 0,
    alphaMaskMs: 0,
    fractureMs: 0,
    fragmentBuildMs: 0,
    runtimeSetupMs: 0,
  };
  
  public runtime: ShatterRuntime | null = null;

  /** Called by React when status changes */
  onStatusChange?: (status: GenerationStatus) => void;
  onPlaybackChange?: (state: PlaybackState) => void;

  constructor(canvas: HTMLCanvasElement, config: ShatterConfig, execution?: DestructionExecutionConfig) {
    this.canvas = canvas;
    this.config = config;
    this.execution = execution ?? createPhysicalExecution(config);
  }

  updateConfig(config: ShatterConfig, execution?: DestructionExecutionConfig) {
    this.config = config;
    this.execution = execution ?? createPhysicalExecution(config);
    if (this.runtime) {
      this.runtime.updateConfig(config, this.execution);
    }
  }

  /** Load and analyse a new SVG */
  async loadSVG(svgInfo: SVGInfo) {
    const operation = ++this.operationVersion;
    if (this.runtime) {
      this.runtime.destroy();
      this.runtime = null;
    }
    this.mask = null;
    this.rasterCanvas = null;
    this.svgImage = null;
    
    this.svgInfo = svgInfo;
    this.rasterScale = getSourceRasterScale(svgInfo.width, svgInfo.height);
    const imageStart = performance.now();
    const svgImage = await loadImage(svgInfo.blobUrl);
    this.assertActive(operation);
    this.svgImage = svgImage;
    this.performanceMetrics.imageLoadMs = performance.now() - imageStart;

    // Rasterize for mask analysis
    this.onStatusChange?.('analysing');
    const rasterStart = performance.now();
    this.rasterCanvas = await rasterizeSVG(svgInfo.sanitized, svgInfo.width, svgInfo.height, this.rasterScale);
    this.assertActive(operation);
    this.performanceMetrics.rasterizeMs = performance.now() - rasterStart;
    const maskStart = performance.now();
    const { mask, width, height } = buildAlphaMask(this.rasterCanvas);
    this.performanceMetrics.alphaMaskMs = performance.now() - maskStart;
    if (!hasVisiblePixels(mask)) throw new Error('The SVG has no visible pixels to shatter.');
    this.mask = mask;
    this.maskWidth = width;
    this.maskHeight = height;

    // Create a temporary runtime just to show the idle intact SVG
    this.runtime = new ShatterRuntime({
      canvas: this.canvas,
      fragments: [],
      config: this.config,
      svgWidth: svgInfo.width,
      svgHeight: svgInfo.height,
      seed: 0,
      svgImage: this.svgImage,
      execution: this.execution,
      onPlaybackChange: this.onPlaybackChange
    });
    this.runtime.drawFrame();
  }

  /** Full generation pipeline */
  async generate(customImpactPoint?: Point) {
    if (!this.svgInfo || !this.mask || !this.svgImage) throw new Error('No SVG loaded');
    const operation = ++this.operationVersion;

    if (this.runtime) {
      this.runtime.destroy();
    }

    const { width: svgW, height: svgH } = this.svgInfo;
    const seed = this.config.seed ?? createRandomSeed();

    // Determine impact point
    let impact: Point;
    if (customImpactPoint) {
      impact = customImpactPoint;
    } else if (this.config.impactMode === 'center') {
      impact = { x: svgW / 2, y: svgH / 2 };
    } else {
      // Auto: visible centroid
      const bounds = getVisibleBounds(this.mask, this.maskWidth, this.maskHeight);
      impact = {
        x: (bounds.x + bounds.w / 2) * svgW,
        y: (bounds.y + bounds.h / 2) * svgH,
      };
    }
    if (!isVisibleSourcePoint(impact, this.mask, this.maskWidth, this.maskHeight, svgW, svgH)) {
      impact = resolveVisibleImpactPoint(
        impact,
        this.mask,
        this.maskWidth,
        this.maskHeight,
        svgW,
        svgH,
      );
    }

    // Generate fracture
    this.onStatusChange?.('fracturing');
    const fractureStart = performance.now();
    const cells = generateFracture({
      fragmentCount: this.config.fragmentCount,
      seed,
      svgWidth: svgW,
      svgHeight: svgH,
      impactPoint: impact,
      mask: this.mask,
      maskWidth: this.maskWidth,
      maskHeight: this.maskHeight,
      profile: this.execution.fractureProfile,
    });
    this.performanceMetrics.fractureMs = performance.now() - fractureStart;

    if (cells.length === 0) throw new Error('Fracture generation produced no cells');

    // Build fragment canvases
    this.onStatusChange?.('building');
    const fragmentStart = performance.now();
    const fragments = await buildFragments({
      cells,
      svgSanitized: this.svgInfo.sanitized,
      svgWidth: svgW,
      svgHeight: svgH,
      rasterCanvas: this.rasterCanvas!,
      rasterScale: this.rasterScale,
      mask: this.mask,
      maskWidth: this.maskWidth,
      maskHeight: this.maskHeight,
      impactPoint: impact,
      hierarchy: this.execution.motionProfile.kind === 'stylized'
        ? { primaryRatio: 0.22, secondaryRatio: 0.42 }
        : undefined,
    });
    this.assertActive(operation);
    this.performanceMetrics.fragmentBuildMs = performance.now() - fragmentStart;

    if (fragments.length === 0) {
      throw new Error('Fragment generation failed: no visible SVG fragments were created.');
    }

    // Validate fragments
    for (const f of fragments) {
      if (!Number.isFinite(f.id) || !Number.isFinite(f.visibleArea) || !Number.isFinite(f.mass) ||
          !Number.isFinite(f.visibleCentroid.x) || !Number.isFinite(f.visibleCentroid.y) ||
          !Number.isFinite(f.initialX) || !Number.isFinite(f.initialY)) {
        throw new Error(`Fragment ${f.id} generated invalid physics properties.`);
      }
      if (f.hullPolygon.length < 3) {
        throw new Error(`Fragment ${f.id} has invalid hull polygon.`);
      }
    }

    this.onStatusChange?.('physics');
    const runtimeStart = performance.now();
    
    // Create actual playable runtime
    this.runtime = new ShatterRuntime({
      canvas: this.canvas,
      fragments,
      config: this.config,
      svgWidth: svgW,
      svgHeight: svgH,
      seed,
      svgImage: this.svgImage,
      execution: this.execution,
      onPlaybackChange: this.onPlaybackChange
    });
    
    this.runtime.impactPoint = impact;
    this.performanceMetrics.runtimeSetupMs = performance.now() - runtimeStart;

    this.onStatusChange?.('sound');
    this.onStatusChange?.('ready');
    
    this.runtime.drawFrame();
  }

  play(customImpactPoint?: Point) {
    this.runtime?.play(customImpactPoint);
  }

  stopAnimation() {
    this.runtime?.stop();
  }

  reset() {
    this.runtime?.reset();
  }

  replay() {
    this.runtime?.play(); // Re-uses last impact point
  }

  getSeed(): number { return this.runtime?.seed || 0; }
  getFragmentCount(): number { return this.runtime?.fragments.length || 0; }
  getImpactPoint(): Point { return this.runtime?.impactPoint || {x:0, y:0}; }

  canvasToSVG(clientX: number, clientY: number): Point {
    if (!this.runtime) return { x: 0, y: 0 };
    return this.runtime.canvasToSourceSpace(clientX, clientY);
  }

  /** Map a client point through the active stage transform and reject transparent source pixels. */
  hitTestVisibleSource(clientX: number, clientY: number): Point | null {
    if (!this.runtime || !this.svgInfo || !this.mask) return null;
    const point = this.runtime.canvasToSourceSpace(clientX, clientY);
    return isVisibleSourcePoint(
      point,
      this.mask,
      this.maskWidth,
      this.maskHeight,
      this.svgInfo.width,
      this.svgInfo.height,
    ) ? point : null;
  }

  getFragments(): ShatterFragment[] { return this.runtime?.fragments || []; }
  getPerformanceMetrics(): ShatterPerformanceMetrics { return { ...this.performanceMetrics }; }

  resize() {
    this.runtime?.resize();
  }

  destroy() {
    this.operationVersion++;
    this.runtime?.destroy();
  }

  private assertActive(operation: number) {
    if (operation !== this.operationVersion) throw new DOMException('Operation superseded', 'AbortError');
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img') as HTMLImageElement;
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
