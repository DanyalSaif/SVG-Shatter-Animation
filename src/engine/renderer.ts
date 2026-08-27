import { ShatterFragment, ShatterConfig, Point, Particle } from '../types/shatter';
import type { StrikeVisualState } from './strikeEngine';
import type { FragmentRuntimeState } from './fragmentLifecycle';
import type { Whisp } from './whispEngine';
import type { SmokePuff } from './smokeEngine';
import type { VisualStyleProfile } from '../types/destructionStyle';

/** Draw the full animation frame to canvas */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  fragments: ShatterFragment[],
  particles: Particle[],
  config: ShatterConfig,
  svgImage: HTMLImageElement | null,
  showOriginal: boolean,
  canvasW: number,
  canvasH: number,
  svgW: number,
  svgH: number,
  dpr: number,
  /** Current shake offset */
  shakeX: number,
  shakeY: number,
  /** Flash alpha 0-1 */
  flashAlpha: number,
  impactPoint: Point | null,
  /** Scale factor: canvas CSS px → SVG units */
  displayScale: number,
  /** Offset to center SVG in canvas */
  offsetX: number,
  offsetY: number,
  strikeVisual?: StrikeVisualState,
  fragmentStates?: ReadonlyMap<number, FragmentRuntimeState>,
  whisps: readonly Whisp[] = [],
  smoke: readonly SmokePuff[] = [],
  visualProfile?: VisualStyleProfile,
) {
  // Clear
  ctx.clearRect(0, 0, canvasW * dpr, canvasH * dpr);

  // Background
  if (config.background === 'dark') {
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, canvasW * dpr, canvasH * dpr);
  } else if (config.background === 'light') {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvasW * dpr, canvasH * dpr);
  } else if (config.background !== 'transparent' && config.background.startsWith('#')) {
    ctx.fillStyle = config.background;
    ctx.fillRect(0, 0, canvasW * dpr, canvasH * dpr);
  }

  ctx.save();

  // Apply DPR and shake
  ctx.scale(dpr, dpr);
  ctx.translate(offsetX + shakeX, offsetY + shakeY);
  ctx.scale(displayScale, displayScale);

  if (showOriginal && svgImage) {
    // Draw the intact original SVG
    ctx.drawImage(svgImage, 0, 0, svgW, svgH);
  }

  // Strike and impact feedback are deliberately below smoke and fragments.
  if (strikeVisual?.active) {
    drawStrikeVisual(ctx, strikeVisual, visualProfile?.slash);
  }

  if (flashAlpha > 0 && impactPoint) {
    drawImpactFlash(ctx, impactPoint, svgW, flashAlpha, visualProfile?.flash);
  }

  if (!showOriginal) {
    if (smoke.length > 0 && visualProfile) {
      drawSmoke(ctx, smoke, visualProfile.smoke, 'central');
    }

    // Draw all fragments
    for (const frag of fragments) {
      const runtimeState = fragmentStates?.get(frag.id);
      if (runtimeState && !runtimeState.alive) continue;
      ctx.save();
      ctx.globalAlpha = runtimeState?.opacity ?? 1;

      // Translate to centroid, rotate, translate back
      const cx = frag.visibleCentroid.x;
      const cy = frag.visibleCentroid.y;

      // The physics body tracked visibleCentroid; frag.x/y is the top-left of the bounding box offset
      ctx.translate(
        frag.visibleCentroid.x + (frag.x - frag.initialX),
        frag.visibleCentroid.y + (frag.y - frag.initialY)
      );
      ctx.rotate(frag.angle);
      const fragmentScale = runtimeState?.scale ?? 1;
      ctx.scale(fragmentScale, fragmentScale);
      ctx.translate(-cx, -cy);

      // Draw this fragment canvas
      const textureScale = frag.textureScale ?? 2;
      ctx.drawImage(
        frag.canvas,
        frag.initialX,
        frag.initialY,
        frag.canvas.width / textureScale,
        frag.canvas.height / textureScale,
      );

      ctx.restore();
    }

    // Impact chips and dust sit over the shards but below converting smoke.
    if (particles.length > 0) {
      drawParticles(ctx, particles, visualProfile?.particles, false);
    }

    if (smoke.length > 0 && visualProfile) {
      drawSmoke(ctx, smoke, visualProfile.smoke, 'shard');
    }

    if (whisps.length > 0) {
      drawWhisps(ctx, whisps, visualProfile?.whisp);
    }

    // Extinction motes are the final animation layer.
    if (particles.length > 0) {
      drawParticles(ctx, particles, visualProfile?.particles, true);
    }
  }

  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: readonly Particle[],
  visual: VisualStyleProfile['particles'] | undefined,
  extinctionLayer: boolean,
) {
  for (const particle of particles) {
    if (particle.life <= 0 || (particle.role === 'extinction') !== extinctionLayer) continue;
    const alpha = particle.life;
    const colorWithAlpha = particle.color.replace(/,1\)$/, `,${alpha.toFixed(2)})`);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colorWithAlpha;
    if (visual?.treatment === 'cel') {
      ctx.strokeStyle = visual.outline;
      ctx.lineWidth = Math.max(0.45, particle.radius * 0.38);
    }
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    const radius = particle.radius * (0.5 + alpha * 0.5);
    if (visual?.treatment === 'cel' && particle.role === 'chip') {
      ctx.beginPath();
      ctx.moveTo(radius * 1.25, 0);
      ctx.lineTo(-radius * 0.7, radius * 0.72);
      ctx.lineTo(-radius, -radius * 0.48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (visual?.treatment === 'cel' && particle.role === 'dust') {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
      ctx.strokeRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
    } else if (particle.role === 'chip') {
      ctx.fillRect(-radius, -radius * 0.45, radius * 2.2, radius * 0.9);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawWhisps(
  ctx: CanvasRenderingContext2D,
  whisps: readonly Whisp[],
  profile?: VisualStyleProfile['whisp'],
) {
  for (const whisp of whisps) {
    if (!whisp.alive || whisp.opacity <= 0 || whisp.points.length < 2) continue;
    const visibleSegments = Math.max(
      1,
      Math.floor((whisp.points.length - 1) * whisp.drawProgress),
    );
    if (profile?.treatment === 'cel') {
      drawCelWhisp(ctx, whisp, visibleSegments, profile);
      continue;
    }
    for (let index = 0; index < visibleSegments; index++) {
      const taper = 1 - index / Math.max(1, whisp.points.length - 1);
      ctx.save();
      ctx.globalAlpha = whisp.opacity * (0.25 + taper * 0.68);
      ctx.strokeStyle = profile?.base ?? 'rgba(248,244,235,0.92)';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.35, whisp.thickness * taper);
      ctx.beginPath();
      ctx.moveTo(whisp.points[index].x, whisp.points[index].y);
      ctx.lineTo(whisp.points[index + 1].x, whisp.points[index + 1].y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawStrikeVisual(
  ctx: CanvasRenderingContext2D,
  state: StrikeVisualState,
  profile?: VisualStyleProfile['slash'],
) {
  const dx = state.end.x - state.start.x;
  const dy = state.end.y - state.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const headT = Math.min(1, state.progress * 1.08);
  const tailT = Math.max(0, headT - 0.62);
  const middleT = (tailT + headT) / 2;
  const pointAt = (t: number): Point => ({ x: state.start.x + dx * t, y: state.start.y + dy * t });
  const tail = pointAt(tailT);
  const middle = pointAt(middleT);
  const head = pointAt(headT);
  const width = Math.max(1.4, length * 0.006);

  if (profile?.treatment === 'cel') {
    ctx.save();
    ctx.globalAlpha = state.opacity;
    ctx.fillStyle = profile.base;
    ctx.strokeStyle = profile.edge;
    ctx.lineWidth = Math.max(0.8, width * 0.72);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(middle.x + nx * width * 1.25, middle.y + ny * width * 1.25);
    ctx.lineTo(head.x, head.y);
    ctx.lineTo(middle.x - nx * width * 1.25, middle.y - ny * width * 1.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = profile.accent;
    ctx.lineWidth = Math.max(0.45, width * 0.28);
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.strokeStyle = profile?.edge ?? 'rgba(225,238,255,0.18)';
  ctx.lineCap = 'round';
  ctx.lineWidth = width * 3.2;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();

  ctx.fillStyle = profile?.base ?? 'rgba(248,252,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(tail.x + nx * width * 0.08, tail.y + ny * width * 0.08);
  ctx.lineTo(middle.x + nx * width, middle.y + ny * width);
  ctx.lineTo(head.x + nx * width * 0.04, head.y + ny * width * 0.04);
  ctx.lineTo(head.x - nx * width * 0.04, head.y - ny * width * 0.04);
  ctx.lineTo(middle.x - nx * width, middle.y - ny * width);
  ctx.lineTo(tail.x - nx * width * 0.08, tail.y - ny * width * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = state.opacity * 0.82;
  ctx.strokeStyle = profile?.accent ?? 'rgba(255,255,255,0.96)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.55, width * 0.42);
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();
  ctx.restore();
}

function drawSmoke(
  ctx: CanvasRenderingContext2D,
  smoke: readonly SmokePuff[],
  profile: VisualStyleProfile['smoke'],
  kind: SmokePuff['kind'],
) {
  for (const puff of smoke) {
    if (puff.kind !== kind || !puff.alive || puff.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = puff.opacity;
    ctx.translate(puff.position.x, puff.position.y);
    ctx.rotate(puff.rotation);
    ctx.scale(puff.scale * puff.stretchX, puff.scale * puff.stretchY);
    if (profile.treatment === 'cel') {
      drawCelSmokeCluster(ctx, puff, profile);
    } else {
      drawSoftSmokeCluster(ctx, puff, profile);
    }
    ctx.restore();
  }
}

function drawSoftSmokeCluster(
  ctx: CanvasRenderingContext2D,
  puff: SmokePuff,
  profile: VisualStyleProfile['smoke'],
) {
  ctx.save();
  ctx.filter = profile.blur > 0 ? `blur(${profile.blur}px)` : 'none';
  const radius = puff.baseRadius;
  const gradient = ctx.createRadialGradient(
    -radius * 0.28,
    -radius * 0.32,
    radius * 0.06,
    radius * 0.06,
    radius * 0.08,
    radius * 1.22,
  );
  gradient.addColorStop(0, profile.highlight);
  gradient.addColorStop(0.48, profile.base);
  gradient.addColorStop(1, profile.shadow);
  ctx.fillStyle = gradient;
  smokeContourPath(ctx, puff, 1);
  ctx.fill();
  ctx.restore();
}

function drawCelSmokeCluster(
  ctx: CanvasRenderingContext2D,
  puff: SmokePuff,
  profile: VisualStyleProfile['smoke'],
) {
  ctx.lineJoin = 'round';
  ctx.fillStyle = profile.outline;
  const outlineScale = 1 + Math.min(0.1, Math.max(0.025, profile.outlineWidth / Math.max(5, puff.baseRadius)));
  smokeContourPath(ctx, puff, outlineScale);
  ctx.fill();
  ctx.fillStyle = profile.base;
  smokeContourPath(ctx, puff, 1);
  ctx.fill();

  const radius = puff.baseRadius;
  ctx.save();
  smokeContourPath(ctx, puff, 1);
  ctx.clip();
  ctx.fillStyle = profile.shadow;
  ctx.beginPath();
  ctx.moveTo(-radius * 1.25, radius * 0.18);
  ctx.quadraticCurveTo(-radius * 0.15, -radius * 0.02, radius * 1.25, radius * 0.28);
  ctx.lineTo(radius * 1.25, radius * 1.3);
  ctx.lineTo(-radius * 1.25, radius * 1.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = profile.highlight;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.58, -radius * 0.2);
  ctx.quadraticCurveTo(-radius * 0.42, -radius * 0.66, radius * 0.04, -radius * 0.52);
  ctx.quadraticCurveTo(radius * 0.22, -radius * 0.34, -radius * 0.12, -radius * 0.14);
  ctx.quadraticCurveTo(-radius * 0.42, radius * 0.02, -radius * 0.58, -radius * 0.2);
  ctx.fill();
  ctx.restore();
}

function smokeContourPath(
  ctx: CanvasRenderingContext2D,
  puff: SmokePuff,
  radiusScale: number,
  offsetX = 0,
  offsetY = 0,
) {
  const contour = puff.contour;
  if (contour.length < 3) return;
  const toX = (index: number) => puff.baseRadius * (contour[index].x * radiusScale + offsetX);
  const toY = (index: number) => puff.baseRadius * (contour[index].y * radiusScale + offsetY);
  const lastIndex = contour.length - 1;
  ctx.beginPath();
  ctx.moveTo((toX(lastIndex) + toX(0)) / 2, (toY(lastIndex) + toY(0)) / 2);
  for (let index = 0; index < contour.length; index++) {
    const nextIndex = (index + 1) % contour.length;
    const pointX = toX(index);
    const pointY = toY(index);
    ctx.quadraticCurveTo(pointX, pointY, (pointX + toX(nextIndex)) / 2, (pointY + toY(nextIndex)) / 2);
  }
  ctx.closePath();
}

function drawCelWhisp(
  ctx: CanvasRenderingContext2D,
  whisp: Whisp,
  visibleSegments: number,
  profile: VisualStyleProfile['whisp'],
) {
  ctx.save();
  ctx.globalAlpha = whisp.opacity;
  ctx.lineJoin = 'round';
  ctx.fillStyle = profile.outline;
  whispRibbonPath(ctx, whisp, visibleSegments, 1.55);
  ctx.fill();
  ctx.fillStyle = profile.base;
  whispRibbonPath(ctx, whisp, visibleSegments, 1);
  ctx.fill();
  ctx.strokeStyle = profile.highlight;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.35, whisp.thickness * 0.2);
  ctx.beginPath();
  ctx.moveTo(whisp.points[0].x, whisp.points[0].y);
  for (let index = 1; index <= visibleSegments; index++) {
    ctx.lineTo(whisp.points[index].x, whisp.points[index].y);
  }
  ctx.stroke();
  ctx.restore();
}

function whispRibbonPath(
  ctx: CanvasRenderingContext2D,
  whisp: Whisp,
  visibleSegments: number,
  widthScale: number,
) {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let index = 0; index <= visibleSegments; index++) {
    const previous = whisp.points[Math.max(0, index - 1)];
    const next = whisp.points[Math.min(visibleSegments, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const taper = Math.max(0.12, 1 - index / Math.max(1, whisp.points.length - 1));
    const halfWidth = whisp.thickness * widthScale * taper * 0.5;
    const nx = -dy / length;
    const ny = dx / length;
    left.push({ x: whisp.points[index].x + nx * halfWidth, y: whisp.points[index].y + ny * halfWidth });
    right.push({ x: whisp.points[index].x - nx * halfWidth, y: whisp.points[index].y - ny * halfWidth });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let index = 1; index < left.length; index++) ctx.lineTo(left[index].x, left[index].y);
  for (let index = right.length - 1; index >= 0; index--) ctx.lineTo(right[index].x, right[index].y);
  ctx.closePath();
}

function drawImpactFlash(
  ctx: CanvasRenderingContext2D,
  impactPoint: Point,
  svgW: number,
  flashAlpha: number,
  profile?: VisualStyleProfile['flash'],
) {
  if (profile?.treatment === 'cel') {
    const outer = Math.max(7, svgW * 0.07);
    const inner = outer * 0.28;
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.translate(impactPoint.x, impactPoint.y);
    ctx.fillStyle = profile.base;
    ctx.strokeStyle = profile.outline;
    ctx.lineWidth = Math.max(0.7, svgW * 0.0025);
    ctx.beginPath();
    for (let index = 0; index < 16; index++) {
      const angle = -Math.PI / 2 + index * Math.PI / 8;
      const radius = index % 2 === 0 ? outer : inner;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = profile.accent;
    ctx.beginPath();
    ctx.arc(0, 0, inner * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const gradient = ctx.createRadialGradient(
    impactPoint.x, impactPoint.y, 0,
    impactPoint.x, impactPoint.y, svgW * 0.14,
  );
  gradient.addColorStop(0, withAlpha(profile?.base ?? 'rgba(255,255,255,1)', flashAlpha));
  gradient.addColorStop(0.3, withAlpha(profile?.accent ?? 'rgba(255,200,100,1)', flashAlpha * 0.5));
  gradient.addColorStop(1, withAlpha(profile?.accent ?? 'rgba(255,200,100,1)', 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(impactPoint.x, impactPoint.y, svgW * 0.19, 0, Math.PI * 2);
  ctx.fill();
}

function withAlpha(color: string, alpha: number): string {
  return color.replace(/rgba\(([^)]+),[^,]+\)$/, `rgba($1,${alpha})`);
}
