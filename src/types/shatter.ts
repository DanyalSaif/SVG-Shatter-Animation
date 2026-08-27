export interface Point {
  x: number;
  y: number;
}

export interface ShatterFragment {
  id: number;
  /** Voronoi polygon in SVG coordinate space */
  clipPolygon: Point[];
  /** Centroid of the clip polygon */
  center: Point;
  /** Visible pixel area (used for mass) */
  area: number;
  visibleArea: number;
  mass: number;
  visibleCentroid: Point;
  /** Convex hull of visible pixels for physics */
  hullPolygon: Point[];
  /** Cached canvas with clipped artwork */
  canvas: HTMLCanvasElement;
  /** Raster pixels per source-space unit for this fragment texture. */
  textureScale?: number;
  /** Initial position (SVG coords) */
  initialX: number;
  initialY: number;
  /** Physics state – updated each step */
  x: number;
  y: number;
  angle: number;
  velocityX: number;
  velocityY: number;
  angularVelocity: number;
  /** Style-aware metadata derived after visible fragments are built. */
  sizeClass?: 'primary' | 'secondary' | 'micro';
  normalizedArea?: number;
  distanceFromImpact?: number;
  aspectRatio?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;         // 0–1
  maxLife: number;
  color: string;
  role: 'impact' | 'chip' | 'dust' | 'extinction';
  rotation: number;
  angularVelocity: number;
}

export interface ShatterConfig {
  fragmentCount: number;   // 6–40
  breakStrength: number;   // 0–1
  gravity: number;         // 0–1
  bounce: number;          // 0–1
  rotation: number;        // 0–1
  particles: 'none' | 'low' | 'medium' | 'high';
  screenShake: 'none' | 'low' | 'medium' | 'high';
  sound: boolean;
  soundSource: 'procedural' | 'custom';
  customSoundVolume: number;
  background: 'transparent' | 'light' | 'dark' | string;
  impactMode: 'auto' | 'center' | 'choose';
  // Advanced
  seed?: number;
  airFriction: number;
  fragmentFriction: number;
  /** @deprecated Bounce is the canonical user-facing restitution control. */
  restitution: number;
  impactRadius: number;
  forceVariation: number;
  rotationVariation: number;
  floorEnabled: boolean;
  floorY: number;          // 0–1 relative to canvas height
  particleLifetime: number; // ms
  animationDuration: number; // ms
  exportFps: number;
}

export const DEFAULT_CONFIG: ShatterConfig = {
  fragmentCount: 16,
  breakStrength: 0.65,
  gravity: 0.65,
  bounce: 0.20,
  rotation: 0.65,
  particles: 'medium',
  screenShake: 'medium',
  sound: true,
  soundSource: 'procedural',
  customSoundVolume: 1.0,
  background: 'transparent',
  impactMode: 'auto',
  airFriction: 0.01,
  fragmentFriction: 0.5,
  restitution: 0.14,
  impactRadius: 0.4,
  forceVariation: 0.35,
  rotationVariation: 0.5,
  floorEnabled: true,
  floorY: 0.92,
  particleLifetime: 600,
  animationDuration: 1800,
  exportFps: 60,
};

export interface SVGInfo {
  raw: string;
  sanitized: string;
  width: number;
  height: number;
  viewBox: string;
  fileName: string;
  fileSize: number;
  blobUrl: string;
}

export type GenerationStatus =
  | 'idle'
  | 'analysing'
  | 'fracturing'
  | 'building'
  | 'physics'
  | 'sound'
  | 'ready';

export type PlaybackState = 'idle' | 'playing' | 'settled';

export interface ShatterResult {
  fragments: ShatterFragment[];
  seed: number;
  impactPoint: Point;
  canvasWidth: number;
  canvasHeight: number;
  config: ShatterConfig;
}
