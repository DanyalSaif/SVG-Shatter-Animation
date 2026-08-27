import Matter from 'matter-js';
import { ShatterFragment, ShatterConfig, Point } from '../types/shatter';
import { createPRNG } from './fractureGenerator';
import { StageTransform } from '../runtime/StageTransform';
import type { MotionProfile } from '../types/destructionStyle';

const { Engine, Bodies, Body, Runner, Composite, Events, Vector } = Matter;

export interface PhysicsState {
  engine: Matter.Engine;
  runner: Matter.Runner | null;
  bodies: Map<number, Matter.Body>;
  baseGravityY: number;
}

export function createPhysicsState(config: ShatterConfig, stageHeight?: number, gravityScale = 1): PhysicsState {
  const heightFactor = stageHeight ? Math.max(0.9, Math.min(1.25, stageHeight / 720)) : 1;
  const baseGravityY = config.gravity * 2.5 * heightFactor;

  const engine = Engine.create({
    gravity: { x: 0, y: baseGravityY * gravityScale },
  });

  const bodies = new Map<number, Matter.Body>();
  // Iterating our fragment map avoids allocating Composite.allBodies() every frame.
  const MAX_SPEED = stageHeight ? Math.max(14, 18 * Math.min(1.3, (stageHeight * 16/9) / 1280)) : 14;
  Events.on(engine, 'beforeUpdate', () => {
    for (const body of bodies.values()) {
      if (!body.isStatic) {
        const speed = Vector.magnitude(body.velocity);
        if (speed > MAX_SPEED) {
          Body.setVelocity(body, Vector.mult(Vector.normalise(body.velocity), MAX_SPEED));
        }
      }
    }
  });

  return { engine, runner: null, bodies, baseGravityY };
}

export function addFragmentBodies(
  state: PhysicsState,
  fragments: ShatterFragment[],
  config: ShatterConfig,
  stageTransform: StageTransform,
) {
  const { engine } = state;
  // Map bounce setting (0 to 1) to restitution (0 to 0.7)
  const restitution = config.bounce * 0.7;

  for (const frag of fragments) {
    const hull = frag.hullPolygon;
    
    // Shift centroid to stage space
    const cx = frag.visibleCentroid.x * stageTransform.scale + stageTransform.sourceOffsetX;
    const cy = frag.visibleCentroid.y * stageTransform.scale + stageTransform.sourceOffsetY;

    // Translate hull to be centred at origin for Matter
    const localVerts = hull.map(p => ({ 
      x: p.x * stageTransform.scale + stageTransform.sourceOffsetX - cx, 
      y: p.y * stageTransform.scale + stageTransform.sourceOffsetY - cy 
    }));

    let body: Matter.Body;
    try {
      if (localVerts.length >= 3) {
        body = Bodies.fromVertices(cx, cy, [localVerts] as unknown as Matter.Vector[][], {
          friction: config.fragmentFriction,
          restitution,
          frictionAir: config.airFriction,
          density: frag.mass / Math.max(1, frag.visibleArea * stageTransform.scale * stageTransform.scale),
          isStatic: false,
          label: `fragment-${frag.id}`,
        }, true);
        // fromVertices shifts the body; correct position
        Body.setPosition(body, { x: cx, y: cy });
      } else {
        throw new Error('Not enough hull vertices');
      }
    } catch {
      // Fallback to rectangle
      const textureScale = frag.textureScale ?? 2;
      const bw = frag.canvas.width / textureScale;
      const bh = frag.canvas.height / textureScale;
      body = Bodies.rectangle(cx, cy, Math.max(bw, 4), Math.max(bh, 4), {
        friction: config.fragmentFriction,
        restitution,
        frictionAir: config.airFriction,
        density: frag.mass / Math.max(1, frag.visibleArea * stageTransform.scale * stageTransform.scale),
        label: `fragment-${frag.id}`,
      });
    }

    // Start sleeping (will be woken on impact)
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);

    state.bodies.set(frag.id, body);
    Composite.add(engine.world, body);
  }

  // Add floor at the configured normalized stage position.
  if (config.floorEnabled) {
    const floorY = stageTransform.stageHeight * config.floorY;
    const floor = Bodies.rectangle(stageTransform.stageWidth / 2, floorY + 100, stageTransform.stageWidth * 3, 200, {
      isStatic: true,
      friction: 0.8,
      restitution: restitution * 0.3, // Low bounce
      label: 'floor',
    });
    Composite.add(engine.world, floor);
  }

  // Left/right invisible walls to keep pieces from flying off sideways infinitely
  const wallW = 200;
  const wallH = stageTransform.stageHeight * 5;
  const leftWall = Bodies.rectangle(
    -stageTransform.stageWidth * 0.1 - wallW / 2, 
    stageTransform.stageHeight / 2, 
    wallW, 
    wallH, 
    { isStatic: true, label: 'wall-left' }
  );
  const rightWall = Bodies.rectangle(
    stageTransform.stageWidth * 1.1 + wallW / 2, 
    stageTransform.stageHeight / 2, 
    wallW, 
    wallH, 
    { isStatic: true, label: 'wall-right' }
  );
  Composite.add(engine.world, [leftWall, rightWall]);
}

function applyStylizedImpact(
  state: PhysicsState,
  fragments: ShatterFragment[],
  impactPoint: Point,
  seed: number,
  stageTransform: StageTransform,
  profile: Extract<MotionProfile, { kind: 'stylized' }>,
) {
  const rand = createPRNG(seed + 1000);
  const impactStageX = impactPoint.x * stageTransform.scale + stageTransform.sourceOffsetX;
  const impactStageY = impactPoint.y * stageTransform.scale + stageTransform.sourceOffsetY;
  const widthFactor = Math.max(0.85, Math.min(1.3, stageTransform.stageWidth / 1280));
  const baseSpeed = (4.5 + profile.force * 7) * widthFactor;
  const maxSpread = (8 + profile.spread * 58) * Math.PI / 180;

  for (const fragment of fragments) {
    const body = state.bodies.get(fragment.id);
    if (!body) continue;

    const cx = fragment.visibleCentroid.x * stageTransform.scale + stageTransform.sourceOffsetX;
    const cy = fragment.visibleCentroid.y * stageTransform.scale + stageTransform.sourceOffsetY;
    const radialX = cx - impactStageX;
    const radialY = cy - impactStageY;
    const radialLength = Math.hypot(radialX, radialY) || 1;
    const deviation = (rand() * 2 - 1) * maxSpread;
    const cos = Math.cos(deviation);
    const sin = Math.sin(deviation);
    const fanX = profile.strikeVector.x * cos - profile.strikeVector.y * sin;
    const fanY = profile.strikeVector.x * sin + profile.strikeVector.y * cos;
    const variationAngle = rand() * Math.PI * 2;
    const blendedX = fanX * profile.directionalWeight
      + (radialX / radialLength) * profile.radialWeight
      + Math.cos(variationAngle) * profile.variationWeight;
    const blendedY = fanY * profile.directionalWeight
      + (radialY / radialLength) * profile.radialWeight
      + Math.sin(variationAngle) * profile.variationWeight;
    const blendedLength = Math.hypot(blendedX, blendedY) || 1;

    const sizeClass = fragment.sizeClass ?? 'secondary';
    const dampingScale = sizeClass === 'primary' ? 0.9 : sizeClass === 'micro' ? 1.18 : 1;
    body.frictionAir = Math.min(0.08, body.frictionAir * dampingScale);
    const speedRange = profile.classSpeed[sizeClass];
    const classSpeed = speedRange[0] + rand() * (speedRange[1] - speedRange[0]);
    const proximityBoost = 1.12 - Math.min(1, fragment.distanceFromImpact ?? 1) * 0.18;
    const speed = baseSpeed * classSpeed * proximityBoost * (0.96 + rand() * 0.08);
    Body.setVelocity(body, {
      x: blendedX / blendedLength * speed,
      y: blendedY / blendedLength * speed,
    });

    const aspectSpin = Math.max(0.75, Math.min(1.65, (fragment.aspectRatio ?? 1) * 0.72));
    const classSpin = sizeClass === 'primary' ? 0.72 : sizeClass === 'micro' ? 1.28 : 1;
    Body.setAngularVelocity(
      body,
      (rand() * 2 - 1) * profile.rotation * 0.24 * aspectSpin * classSpin,
    );
  }
}

/** Apply impact forces to all bodies */
export function applyImpact(
  state: PhysicsState,
  fragments: ShatterFragment[],
  impactPoint: Point,
  config: ShatterConfig,
  seed: number,
  stageTransform: StageTransform,
  motionProfile: MotionProfile = { kind: 'physical' },
) {
  if (motionProfile.kind === 'stylized') {
    applyStylizedImpact(state, fragments, impactPoint, seed, stageTransform, motionProfile);
    return;
  }

  const rand = createPRNG(seed + 1000);
  const { bodies } = state;

  // Map impact point to stage space
  const impactStageX = impactPoint.x * stageTransform.scale + stageTransform.sourceOffsetX;
  const impactStageY = impactPoint.y * stageTransform.scale + stageTransform.sourceOffsetY;

  // Calculate actual max distance for smooth falloff without square root bug
  const maxDist = fragments.reduce((max, f) => {
    const cx = f.visibleCentroid.x * stageTransform.scale + stageTransform.sourceOffsetX;
    const cy = f.visibleCentroid.y * stageTransform.scale + stageTransform.sourceOffsetY;
    const d = Math.hypot(cx - impactStageX, cy - impactStageY);
    return d > max ? d : max;
  }, 1);

  // Width factor to scale speed based on stage size
  const widthFactor = Math.max(0.85, Math.min(1.3, stageTransform.stageWidth / 1280));
  
  // Base speed: roughly 4.5 to 11.5 units depending on strength
  let baseSpeed = 4.5 + (config.breakStrength * 7.0);
  baseSpeed *= widthFactor;

  for (const frag of fragments) {
    const body = bodies.get(frag.id);
    if (!body) continue;

    const cx = frag.visibleCentroid.x * stageTransform.scale + stageTransform.sourceOffsetX;
    const cy = frag.visibleCentroid.y * stageTransform.scale + stageTransform.sourceOffsetY;

    const dx = cx - impactStageX;
    const dy = cy - impactStageY;
    const dist = Math.hypot(dx, dy) || 1;

    // Direction from impact to fragment (normalized)
    const nx = dx / dist;
    const ny = dy / dist;

    // Falloff: closer = more force
    const falloff = Math.max(0.2, 1 - dist / (maxDist * 1.5));
    
    // Size factor instead of unbounded inverse mass
    // Large mass (>500) -> 0.65x speed
    // Medium mass (100-500) -> 0.9x speed
    // Small mass (<100) -> 1.3x speed
    let sizeFactor = 1.0;
    if (frag.mass > 500) sizeFactor = 0.65 + rand() * 0.2;
    else if (frag.mass > 100) sizeFactor = 0.9 + rand() * 0.2;
    else sizeFactor = 1.25 + rand() * 0.25;

    const speedMag = baseSpeed * falloff * sizeFactor;

    // Add upward bias (more random, pushing generally up/out)
    const upBias = -(rand() * 0.6 + 0.1); 
    const variation = config.forceVariation;

    const fx = nx * speedMag * (1 + (rand() - 0.5) * variation);
    const fy = (ny + upBias) * speedMag * (1 + (rand() - 0.5) * variation);

    Body.setVelocity(body, {
      x: fx,
      y: fy,
    });

    // Angular velocity – smaller pieces spin more
    const spinFactor = 1 / Math.max(0.5, Math.sqrt(frag.mass) * 0.1);
    Body.setAngularVelocity(body, (rand() - 0.5) * config.rotation * 0.5 * spinFactor);
  }
}

/** Read body positions into fragment array, converting back to source space */
export function syncFragmentsFromBodies(state: PhysicsState, fragments: ShatterFragment[], stageTransform: StageTransform) {
  for (const frag of fragments) {
    const body = state.bodies.get(frag.id);
    if (!body) continue;
    
    // Body is in stage space. We need to store fragment translation in source space relative to initial placement.
    // The fragment was initially placed such that visibleCentroid was at body.position.
    const cx = frag.visibleCentroid.x;
    const cy = frag.visibleCentroid.y;
    
    // Convert current body pos back to source space
    const sourceX = (body.position.x - stageTransform.sourceOffsetX) / stageTransform.scale;
    const sourceY = (body.position.y - stageTransform.sourceOffsetY) / stageTransform.scale;
    
    // Calculate the delta in source space from its initial centroid
    frag.x = frag.initialX + (sourceX - cx);
    frag.y = frag.initialY + (sourceY - cy);
    frag.angle = body.angle;
    
    // Store velocities back in source space for React exports
    frag.velocityX = body.velocity.x / stageTransform.scale;
    frag.velocityY = body.velocity.y / stageTransform.scale;
    frag.angularVelocity = body.angularVelocity;
  }
}

export function stepPhysics(state: PhysicsState, deltaMs: number, gravityScale = 1) {
  state.engine.gravity.y = state.baseGravityY * gravityScale;
  Engine.update(state.engine, deltaMs);
}

export function destroyPhysicsState(state: PhysicsState | null) {
  if (state) {
    if (state.runner) {
      Runner.stop(state.runner);
    }
    Engine.clear(state.engine);
    Composite.clear(state.engine.world, false);
  }
}
