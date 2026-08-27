import { Point } from '../types/shatter';

export interface StageTransform {
  sourceWidth: number;
  sourceHeight: number;
  stageWidth: number;
  stageHeight: number;
  scale: number;
  sourceOffsetX: number;
  sourceOffsetY: number;
}

/**
 * Calculates a responsive stage size and position based on the SVG dimensions.
 * The SVG should occupy ~40-50% of the stage height to allow fragments room to fly.
 */
export function calculateStageTransform(svgWidth: number, svgHeight: number): StageTransform {
  const aspect = svgWidth / svgHeight;
  
  // Base the stage on a 16:9 or 4:3 area depending on object aspect
  const targetStageHeight = svgHeight * 2.5; // Object takes ~40% of height
  const minStageWidth = targetStageHeight * (aspect < 1 ? 1.2 : 1.6);
  
  const stageWidth = Math.max(svgWidth * 3, minStageWidth);
  const stageHeight = targetStageHeight;

  // Center the SVG inside the stage
  const sourceOffsetX = (stageWidth - svgWidth) / 2;
  const sourceOffsetY = (stageHeight - svgHeight) / 2;

  return {
    sourceWidth: svgWidth,
    sourceHeight: svgHeight,
    stageWidth,
    stageHeight,
    scale: 1, // Base scale, rendered canvas scale will be separate
    sourceOffsetX,
    sourceOffsetY
  };
}

/**
 * Calculates a responsive stage size for a fullscreen 16:9 export layout.
 * Limits SVG visual size to ~300-400px maximum based on desktop/mobile space,
 * and centers it at 43% of the stage height.
 */
export function calculateResponsiveExportTransform(
  sourceWidth: number,
  sourceHeight: number,
  stageWidth: number,
  stageHeight: number
): StageTransform {
  // Desktop max: 400px. Smaller screens: shrink to fit.
  let maxObjectSize = Math.max(300, Math.min(400, stageWidth * 0.25));

  // Narrow screen safeguard
  maxObjectSize = Math.min(
    maxObjectSize,
    stageWidth * 0.55,
    stageHeight * 0.48
  );

  const scale = Math.min(
    maxObjectSize / sourceWidth,
    maxObjectSize / sourceHeight
  );

  const sourceOffsetX = (stageWidth - sourceWidth * scale) / 2;
  const sourceOffsetY = stageHeight * 0.43 - (sourceHeight * scale) / 2;

  return {
    sourceWidth,
    sourceHeight,
    stageWidth,
    stageHeight,
    scale,
    sourceOffsetX,
    sourceOffsetY
  };
}

// Coordinate conversions
export function sourceToStage(pt: Point, transform: StageTransform): Point {
  return {
    x: pt.x * transform.scale + transform.sourceOffsetX,
    y: pt.y * transform.scale + transform.sourceOffsetY
  };
}

export function stageToSource(pt: Point, transform: StageTransform): Point {
  return {
    x: (pt.x - transform.sourceOffsetX) / transform.scale,
    y: (pt.y - transform.sourceOffsetY) / transform.scale
  };
}
