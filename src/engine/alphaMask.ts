/** Rasterize SVG to an offscreen canvas for alpha analysis */
export async function rasterizeSVG(
  svgSanitized: string,
  targetWidth: number,
  targetHeight: number,
  scale = 2
): Promise<HTMLCanvasElement> {
  const w = Math.max(1, Math.round(targetWidth * scale));
  const h = Math.max(1, Math.round(targetHeight * scale));

  const blob = new Blob([svgSanitized], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (_e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to rasterize SVG'));
    };
    img.src = url;
  });
}

/** Build a binary alpha mask at reduced resolution for visible pixel detection */
export function buildAlphaMask(
  canvas: HTMLCanvasElement,
  threshold = 16
): { mask: Uint8Array; width: number; height: number } {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = data[i * 4 + 3] >= threshold ? 1 : 0;
  }
  return { mask, width, height };
}

/** Return visible bounding box in normalized [0,1] coordinates */
export function getVisibleBounds(
  mask: Uint8Array,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let hasVisible = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        hasVisible = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasVisible) return { x: 0, y: 0, w: 1, h: 1 };

  return {
    x: minX / width,
    y: minY / height,
    w: (maxX - minX) / width,
    h: (maxY - minY) / height,
  };
}

export function hasVisiblePixels(mask: Uint8Array): boolean {
  return mask.some(value => value !== 0);
}

/** Clamps to source bounds and moves transparent impact points to the nearest occupied mask pixel. */
export function resolveVisibleImpactPoint(
  point: { x: number; y: number },
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  svgWidth: number,
  svgHeight: number,
): { x: number; y: number } {
  const clamped = {
    x: Math.max(0, Math.min(svgWidth, Number.isFinite(point.x) ? point.x : svgWidth / 2)),
    y: Math.max(0, Math.min(svgHeight, Number.isFinite(point.y) ? point.y : svgHeight / 2)),
  };
  const targetX = Math.max(0, Math.min(maskWidth - 1, Math.round(clamped.x / Math.max(1, svgWidth) * (maskWidth - 1))));
  const targetY = Math.max(0, Math.min(maskHeight - 1, Math.round(clamped.y / Math.max(1, svgHeight) * (maskHeight - 1))));
  if (mask[targetY * maskWidth + targetX]) return clamped;

  let nearestX = -1;
  let nearestY = -1;
  let nearestDistance = Infinity;
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      if (!mask[y * maskWidth + x]) continue;
      const distance = (x - targetX) ** 2 + (y - targetY) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestX = x;
        nearestY = y;
      }
    }
  }
  return nearestX < 0 ? clamped : {
    x: (nearestX + 0.5) / maskWidth * svgWidth,
    y: (nearestY + 0.5) / maskHeight * svgHeight,
  };
}

/** Sample visible pixel positions within a polygon region, returns points in [0,1] normalized space */
export function sampleVisiblePointsInRegion(
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  polygon: { x: number; y: number }[],
  /** These polygon coords are in SVG space (0..svgW, 0..svgH) */
  svgWidth: number,
  svgHeight: number,
  maxSamples = 64
): { x: number; y: number }[] {
  // Bounding box of polygon in mask space
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    const mx = (p.x / svgWidth) * maskWidth;
    const my = (p.y / svgHeight) * maskHeight;
    if (mx < minX) minX = mx;
    if (my < minY) minY = my;
    if (mx > maxX) maxX = mx;
    if (my > maxY) maxY = my;
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(maskWidth - 1, Math.ceil(maxX));
  maxY = Math.min(maskHeight - 1, Math.ceil(maxY));

  const visible: { x: number; y: number }[] = [];

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      if (!mask[py * maskWidth + px]) continue;

      // SVG coords
      const sx = (px / maskWidth) * svgWidth;
      const sy = (py / maskHeight) * svgHeight;

      if (pointInPolygon(sx, sy, polygon)) {
        visible.push({ x: sx, y: sy });
      }
    }
  }

  // Downsample if too many
  if (visible.length <= maxSamples) return visible;
  const step = Math.ceil(visible.length / maxSamples);
  return visible.filter((_, i) => i % step === 0);
}

function pointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Finds all connected components of visible pixels within a given polygon */
export function findConnectedComponentsInRegion(
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  polygon: { x: number; y: number }[],
  svgWidth: number,
  svgHeight: number
): { x: number; y: number }[][] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    const mx = (p.x / svgWidth) * maskWidth;
    const my = (p.y / svgHeight) * maskHeight;
    if (mx < minX) minX = mx;
    if (my < minY) minY = my;
    if (mx > maxX) maxX = mx;
    if (my > maxY) maxY = my;
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(maskWidth - 1, Math.ceil(maxX));
  maxY = Math.min(maskHeight - 1, Math.ceil(maxY));

  // Build a local bitmask of valid pixels inside the polygon
  const localW = maxX - minX + 1;
  const localH = maxY - minY + 1;
  const localMask = new Uint8Array(localW * localH);
  
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      if (!mask[py * maskWidth + px]) continue;
      const sx = (px / maskWidth) * svgWidth;
      const sy = (py / maskHeight) * svgHeight;
      if (pointInPolygon(sx, sy, polygon)) {
        localMask[(py - minY) * localW + (px - minX)] = 1;
      }
    }
  }

  const components: { x: number; y: number }[][] = [];
  const visited = new Uint8Array(localW * localH);
  
  // BFS
  const q = new Int32Array(localW * localH * 2);
  
  for (let y = 0; y < localH; y++) {
    for (let x = 0; x < localW; x++) {
      const idx = y * localW + x;
      if (localMask[idx] && !visited[idx]) {
        let qhead = 0, qtail = 0;
        q[qtail++] = x;
        q[qtail++] = y;
        visited[idx] = 1;
        
        const comp: { x: number; y: number }[] = [];
        
        while (qhead < qtail) {
          const cx = q[qhead++];
          const cy = q[qhead++];
          
          comp.push({
            x: ((cx + minX) / maskWidth) * svgWidth,
            y: ((cy + minY) / maskHeight) * svgHeight
          });
          
          // 4-way connect
          for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && nx < localW && ny >= 0 && ny < localH) {
              const nidx = ny * localW + nx;
              if (localMask[nidx] && !visited[nidx]) {
                visited[nidx] = 1;
                q[qtail++] = nx;
                q[qtail++] = ny;
              }
            }
          }
        }
        
        if (comp.length > 5) { // Ignore tiny 1-5 pixel dust motes
          components.push(comp);
        }
      }
    }
  }
  
  return components;
}
