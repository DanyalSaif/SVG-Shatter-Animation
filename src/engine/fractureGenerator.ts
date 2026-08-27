import { Delaunay } from 'd3-delaunay';
import { Point } from '../types/shatter';
import type { FractureProfile } from '../types/destructionStyle';

/** Mulberry32 seeded PRNG – returns a function that gives 0..1 */
export function createPRNG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Produces a new seed; all effect randomness after this boundary remains seeded. */
export function createRandomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

export interface VoronoiCell {
  polygon: Point[];
  center: Point;
}

interface FractureOptions {
  fragmentCount: number;
  seed: number;
  svgWidth: number;
  svgHeight: number;
  impactPoint: Point;
  /** Mask info for biasing points to visible areas */
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  profile?: FractureProfile;
}

/** Generate Voronoi fracture cells biased around impact point and visible artwork */
export function generateFracture(opts: FractureOptions): VoronoiCell[] {
  if (opts.profile?.kind === 'stylized') return generateStylizedFracture(opts);

  const { fragmentCount, seed, svgWidth, svgHeight, impactPoint, mask, maskWidth, maskHeight } = opts;
  const rand = createPRNG(seed);

  // Collect visible pixel positions (sampled)
  const visiblePoints: Point[] = [];
  const step = Math.ceil(maskWidth / 60);
  for (let y = 0; y < maskHeight; y += step) {
    for (let x = 0; x < maskWidth; x += step) {
      if (mask[y * maskWidth + x]) {
        visiblePoints.push({
          x: (x / maskWidth) * svgWidth,
          y: (y / maskHeight) * svgHeight,
        });
      }
    }
  }

  if (visiblePoints.length === 0) {
    // Fallback: fill whole canvas
    for (let i = 0; i < fragmentCount * 10; i++) {
      visiblePoints.push({ x: rand() * svgWidth, y: rand() * svgHeight });
    }
  }

  // Classify target fragment counts
  const nLarge = Math.max(1, Math.round(fragmentCount * 0.20));
  const nSmall = Math.max(1, Math.round(fragmentCount * 0.30));
  const nMedium = fragmentCount - nLarge - nSmall;

  // Near impact: small fragments (within ~25% of max dimension)
  const nearRadius = Math.max(svgWidth, svgHeight) * 0.25;
  // Mid impact: medium fragments (within ~55%)
  const midRadius = Math.max(svgWidth, svgHeight) * 0.55;

  const seedPoints: [number, number][] = [];

  const pickRandom = () => visiblePoints[Math.floor(rand() * visiblePoints.length)];
  const addBiasedPoint = (maxR: number, minR = 0) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const p = pickRandom();
      const dist = Math.hypot(p.x - impactPoint.x, p.y - impactPoint.y);
      if (dist >= minR && dist <= maxR) {
        const jitter = 4;
        seedPoints.push([p.x + (rand() - 0.5) * jitter, p.y + (rand() - 0.5) * jitter]);
        return;
      }
    }
    // Fallback: any visible point
    const p = pickRandom();
    seedPoints.push([p.x, p.y]);
  };

  // Small fragments near impact
  for (let i = 0; i < nSmall; i++) addBiasedPoint(nearRadius);

  // Medium fragments mid range
  for (let i = 0; i < nMedium; i++) addBiasedPoint(midRadius, nearRadius * 0.5);

  // Large fragments far
  for (let i = 0; i < nLarge; i++) addBiasedPoint(Math.max(svgWidth, svgHeight) * 2, midRadius * 0.5);

  // Deduplicate nearby points (min distance 8px)
  const filtered: [number, number][] = [];
  for (const p of seedPoints) {
    const tooClose = filtered.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 8);
    if (!tooClose) filtered.push(p);
  }
  
  // If we lost points to deduplication, add valid points until we hit fragmentCount
  let attempts = 0;
  while (filtered.length < fragmentCount && attempts < 100) {
    const p = pickRandom();
    const tooClose = filtered.some(q => Math.hypot(p.x - q[0], p.y - q[1]) < 8);
    if (!tooClose) filtered.push([p.x, p.y]);
    attempts++;
  }
  // If still short (extremely rare, like tiny image), just force them in
  while (filtered.length < fragmentCount) {
    const p = pickRandom();
    filtered.push([p.x, p.y]);
  }

  return buildVoronoiCells(filtered, svgWidth, svgHeight);
}

/** Authored seed distribution: dense near impact, sparse at the perimeter, with a strike-axis bias. */
function generateStylizedFracture(opts: FractureOptions): VoronoiCell[] {
  const { fragmentCount, seed, svgWidth, svgHeight, impactPoint, mask, maskWidth, maskHeight } = opts;
  const profile = opts.profile?.kind === 'stylized' ? opts.profile : null;
  const rand = createPRNG(seed);
  const visiblePoints: Point[] = [];
  const step = Math.ceil(maskWidth / 60);
  for (let y = 0; y < maskHeight; y += step) {
    for (let x = 0; x < maskWidth; x += step) {
      if (mask[y * maskWidth + x]) {
        visiblePoints.push({ x: (x / maskWidth) * svgWidth, y: (y / maskHeight) * svgHeight });
      }
    }
  }
  if (visiblePoints.length === 0) {
    for (let i = 0; i < fragmentCount * 10; i++) {
      visiblePoints.push({ x: rand() * svgWidth, y: rand() * svgHeight });
    }
  }

  const maxDimension = Math.max(svgWidth, svgHeight);
  const denseCount = Math.max(1, Math.round(fragmentCount * 0.5));
  const directionalCount = Math.max(
    1,
    Math.round(fragmentCount * (0.16 + (profile?.directionalBias ?? 0.24) * 0.5)),
  );
  const broadCount = Math.max(0, fragmentCount - denseCount - directionalCount);
  const nearRadius = maxDimension * (0.26 - (profile?.impactDensity ?? 0.7) * 0.1);
  const direction = profile?.strikeVector ?? { x: 1, y: 0 };
  const seedPoints: [number, number][] = [];
  const pick = () => visiblePoints[Math.floor(rand() * visiblePoints.length)];
  const addMatching = (matches: (point: Point) => boolean) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const point = pick();
      if (!matches(point)) continue;
      const jitter = Math.max(1.5, maxDimension * 0.006);
      seedPoints.push([point.x + (rand() - 0.5) * jitter, point.y + (rand() - 0.5) * jitter]);
      return;
    }
    const point = pick();
    seedPoints.push([point.x, point.y]);
  };

  for (let i = 0; i < denseCount; i++) {
    addMatching(point => Math.hypot(point.x - impactPoint.x, point.y - impactPoint.y) <= nearRadius);
  }
  for (let i = 0; i < directionalCount; i++) {
    addMatching(point => {
      const dx = point.x - impactPoint.x;
      const dy = point.y - impactPoint.y;
      const along = dx * direction.x + dy * direction.y;
      const across = Math.abs(dx * -direction.y + dy * direction.x);
      return along >= -nearRadius * 0.2 && along <= maxDimension * 0.58 && across <= nearRadius * 0.75;
    });
  }
  for (let i = 0; i < broadCount; i++) {
    addMatching(point => Math.hypot(point.x - impactPoint.x, point.y - impactPoint.y) >= nearRadius * 0.9);
  }

  const minDistance = Math.max(4, Math.min(svgWidth, svgHeight) * 0.018);
  const filtered: [number, number][] = [];
  for (const point of seedPoints) {
    if (!filtered.some(other => Math.hypot(point[0] - other[0], point[1] - other[1]) < minDistance)) {
      filtered.push(point);
    }
  }
  let attempts = 0;
  while (filtered.length < fragmentCount && attempts < 160) {
    const point = pick();
    if (!filtered.some(other => Math.hypot(point.x - other[0], point.y - other[1]) < minDistance)) {
      filtered.push([point.x, point.y]);
    }
    attempts++;
  }
  while (filtered.length < fragmentCount) {
    const point = pick();
    filtered.push([point.x, point.y]);
  }

  return buildVoronoiCells(filtered, svgWidth, svgHeight);
}

function buildVoronoiCells(filtered: [number, number][], svgWidth: number, svgHeight: number): VoronoiCell[] {
  // Add boundary guard points to make Voronoi cover the whole SVG
  const pad = 50;
  const guards: [number, number][] = [
    [-pad, -pad], [svgWidth / 2, -pad], [svgWidth + pad, -pad],
    [-pad, svgHeight / 2], [svgWidth + pad, svgHeight / 2],
    [-pad, svgHeight + pad], [svgWidth / 2, svgHeight + pad], [svgWidth + pad, svgHeight + pad],
  ];
  const allPoints: [number, number][] = [...filtered, ...guards];

  const delaunay = Delaunay.from(allPoints);
  const voronoi = delaunay.voronoi([-pad, -pad, svgWidth + pad, svgHeight + pad]);

  const cells: VoronoiCell[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const rawPoly = voronoi.cellPolygon(i);
    if (!rawPoly || rawPoly.length < 3) continue;

    // Clip polygon to SVG bounds
    const clipped = clipPolygonToRect(
      rawPoly.map(([x, y]: [number, number]) => ({ x, y })),
      0, 0, svgWidth, svgHeight
    );
    if (clipped.length < 3) continue;

    const cx = clipped.reduce((s, p) => s + p.x, 0) / clipped.length;
    const cy = clipped.reduce((s, p) => s + p.y, 0) / clipped.length;
    cells.push({ polygon: clipped, center: { x: cx, y: cy } });
  }

  return cells;
}

/** Sutherland–Hodgman polygon clipping to rectangle */
function clipPolygonToRect(
  polygon: Point[],
  x0: number, y0: number, x1: number, y1: number
): Point[] {
  let output = polygon;

  const edges: [Point, Point][] = [
    [{ x: x0, y: y0 }, { x: x1, y: y0 }], // top
    [{ x: x1, y: y0 }, { x: x1, y: y1 }], // right
    [{ x: x1, y: y1 }, { x: x0, y: y1 }], // bottom
    [{ x: x0, y: y1 }, { x: x0, y: y0 }], // left
  ];

  for (const [a, b] of edges) {
    if (output.length === 0) return [];
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const curr = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const currInside = isInside(curr, a, b);
      const prevInside = isInside(prev, a, b);
      if (currInside) {
        if (!prevInside) output.push(intersect(prev, curr, a, b));
        output.push(curr);
      } else if (prevInside) {
        output.push(intersect(prev, curr, a, b));
      }
    }
  }

  return output;
}

function isInside(p: Point, a: Point, b: Point): boolean {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
}

function intersect(p1: Point, p2: Point, a: Point, b: Point): Point {
  const A1 = p2.y - p1.y, B1 = p1.x - p2.x;
  const C1 = A1 * p1.x + B1 * p1.y;
  const A2 = b.y - a.y, B2 = a.x - b.x;
  const C2 = A2 * a.x + B2 * a.y;
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-10) return p1;
  return { x: (C1 * B2 - C2 * B1) / det, y: (A1 * C2 - A2 * C1) / det };
}

/** Convex hull (Graham scan) */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Polygon area (Shoelace) */
export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(a) / 2;
}
