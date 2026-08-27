export const MAX_RENDER_DPR = 2;

export function getRenderDpr(): number {
  return Math.max(1, Math.min(MAX_RENDER_DPR, window.devicePixelRatio || 1));
}

/** Keeps analysis and fragment texture memory bounded while retaining 2× quality for normal assets. */
export function getSourceRasterScale(width: number, height: number): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const maxSideScale = 2048 / Math.max(safeWidth, safeHeight);
  const maxPixelScale = Math.sqrt(8_000_000 / (safeWidth * safeHeight));
  return Math.max(0.01, Math.min(2, maxSideScale, maxPixelScale));
}
