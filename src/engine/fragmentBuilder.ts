import { ShatterFragment, Point } from '../types/shatter';
import { VoronoiCell, convexHull, polygonArea } from './fractureGenerator';
import { findConnectedComponentsInRegion } from './alphaMask';

interface BuildFragmentsOptions {
  cells: VoronoiCell[];
  svgSanitized: string;
  svgWidth: number;
  svgHeight: number;
  rasterCanvas: HTMLCanvasElement;
  /** Scale factor used when the raster was created */
  rasterScale: number;
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  impactPoint: Point;
  hierarchy?: {
    primaryRatio: number;
    secondaryRatio: number;
  };
}

/** Build one canvas per fragment with the SVG artwork clipped to the Voronoi polygon */
export async function buildFragments(opts: BuildFragmentsOptions): Promise<ShatterFragment[]> {
  const { cells, svgWidth, svgHeight, rasterScale, mask, maskWidth, maskHeight } = opts;

  // Load SVG as Image for clean drawing
  const svgBlob = new Blob([opts.svgSanitized], { type: 'image/svg+xml' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const svgImage = await loadImage(svgUrl);
  URL.revokeObjectURL(svgUrl);

  const fragments: ShatterFragment[] = [];
  let fragId = 0;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const poly = cell.polygon;
    const area = polygonArea(poly);

    // Bounding box of this cell
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const bw = Math.ceil(maxX - minX);
    const bh = Math.ceil(maxY - minY);
    if (bw < 1 || bh < 1) continue;

    // Detect islands within this Voronoi cell
    const islands = findConnectedComponentsInRegion(
      mask, maskWidth, maskHeight, poly, svgWidth, svgHeight
    );

    if (islands.length === 0) continue; // Pure transparent cell, discard

    for (const islandPts of islands) {
      let hull = convexHull(islandPts);
      if (hull.length < 3) continue;
      
      // Calculate accurate visible centroid and visible area directly from the pixels, not the hull
      const visibleArea = islandPts.length * (svgWidth / maskWidth) * (svgHeight / maskHeight);
      let cx = 0, cy = 0;
      for (const p of islandPts) {
        cx += p.x; cy += p.y;
      }
      cx /= islandPts.length;
      cy /= islandPts.length;
      
      const visibleCentroid = { x: cx, y: cy };

      // Bounding box of the ISLAND (to save memory)
      let iminX = Infinity, iminY = Infinity, imaxX = -Infinity, imaxY = -Infinity;
      for (const p of islandPts) {
        if (p.x < iminX) iminX = p.x;
        if (p.y < iminY) iminY = p.y;
        if (p.x > imaxX) imaxX = p.x;
        if (p.y > imaxY) imaxY = p.y;
      }
      // Add slight padding to avoid clipping edge pixels
      iminX = Math.max(0, iminX - 1);
      iminY = Math.max(0, iminY - 1);
      imaxX = Math.min(svgWidth, imaxX + 1);
      imaxY = Math.min(svgHeight, imaxY + 1);
      
      const ibw = Math.ceil(imaxX - iminX);
      const ibh = Math.ceil(imaxY - iminY);
      if (ibw < 1 || ibh < 1) continue;

      // Create per-fragment canvas (at 2× for sharpness)
      const scale = rasterScale;
      const fragCanvas = document.createElement('canvas');
      fragCanvas.width = Math.ceil(ibw * scale);
      fragCanvas.height = Math.ceil(ibh * scale);
      const ctx = fragCanvas.getContext('2d')!;

      // Clip to the hull of the island, NOT the whole Voronoi polygon.
      // This ensures this physical fragment only shows its own connected piece of SVG artwork.
      ctx.beginPath();
      ctx.moveTo((hull[0].x - iminX) * scale, (hull[0].y - iminY) * scale);
      for (let k = 1; k < hull.length; k++) {
        ctx.lineTo((hull[k].x - iminX) * scale, (hull[k].y - iminY) * scale);
      }
      ctx.closePath();
      ctx.clip();

      // Draw the full SVG shifted so this island's portion lands correctly
      ctx.drawImage(
        svgImage,
        -iminX * scale, -iminY * scale,
        svgWidth * scale, svgHeight * scale
      );

      // Mass proportional to visible area.
      // Scale area back to something manageable
      const mass = Math.max(0.1, visibleArea * 0.05);

      fragments.push({
        id: fragId++,
        clipPolygon: hull, // The React export will use this for clipping!
        center: cell.center, // Original Voronoi center
        area,
        visibleArea,
        visibleCentroid,
        mass,
        hullPolygon: hull,
        canvas: fragCanvas,
        textureScale: scale,
        initialX: iminX,
        initialY: iminY,
        x: iminX,
        y: iminY,
        angle: 0,
        velocityX: 0,
        velocityY: 0,
        angularVelocity: 0,
        sizeClass: 'secondary',
        normalizedArea: 0,
        distanceFromImpact: 0,
        aspectRatio: 1,
      });
    }
  }

  return classifyFragmentMetadata(fragments, opts.impactPoint, svgWidth, svgHeight, opts.hierarchy);
}

export function classifyFragmentMetadata(
  fragments: ShatterFragment[],
  impactPoint: Point,
  svgWidth: number,
  svgHeight: number,
  hierarchy: { primaryRatio: number; secondaryRatio: number } = {
    primaryRatio: 0.22,
    secondaryRatio: 0.5,
  },
): ShatterFragment[] {
  if (fragments.length === 0) return fragments;
  const largestArea = Math.max(...fragments.map(fragment => fragment.visibleArea), 1);
  const diagonal = Math.hypot(svgWidth, svgHeight) || 1;
  const ranked = [...fragments].sort((a, b) => b.visibleArea - a.visibleArea || a.id - b.id);
  const primaryCount = Math.max(1, Math.round(ranked.length * hierarchy.primaryRatio));
  const secondaryCount = Math.min(
    ranked.length - primaryCount,
    Math.max(0, Math.round(ranked.length * hierarchy.secondaryRatio)),
  );

  ranked.forEach((fragment, index) => {
    fragment.sizeClass = index < primaryCount
      ? 'primary'
      : index < primaryCount + secondaryCount ? 'secondary' : 'micro';
    fragment.normalizedArea = fragment.visibleArea / largestArea;
    fragment.distanceFromImpact = Math.min(
      1,
      Math.hypot(
        fragment.visibleCentroid.x - impactPoint.x,
        fragment.visibleCentroid.y - impactPoint.y,
      ) / diagonal,
    );

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of fragment.hullPolygon) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    fragment.aspectRatio = Math.max(width, height) / Math.min(width, height);
  });

  return fragments;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
