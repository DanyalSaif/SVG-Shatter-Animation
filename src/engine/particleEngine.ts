import { Particle, ShatterConfig, Point } from '../types/shatter';
import { createPRNG } from './fractureGenerator';

const PARTICLE_COUNTS = { none: 0, low: 8, medium: 16, high: 28 };

export function spawnParticles(
  impactPoint: Point,
  config: ShatterConfig,
  seed: number
): Particle[] {
  const count = PARTICLE_COUNTS[config.particles];
  if (count === 0) return [];

  const rand = createPRNG(seed + 2000);
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const speed = rand() * 4 + 1;
    const size = rand() * 3 + 1;
    const life = config.particleLifetime * (0.5 + rand() * 0.8);

    // Colour: mix of white sparks and dust
    const isSpark = rand() > 0.5;
    const color = isSpark
      ? `rgba(255,${220 + Math.floor(rand() * 35)},${160 + Math.floor(rand() * 60)},1)`
      : `rgba(${180 + Math.floor(rand() * 60)},${160 + Math.floor(rand() * 40)},${130 + Math.floor(rand() * 40)},1)`;

    particles.push({
      x: impactPoint.x + (rand() - 0.5) * 20,
      y: impactPoint.y + (rand() - 0.5) * 20,
      vx: Math.cos(angle) * speed * (0.5 + rand()),
      vy: Math.sin(angle) * speed * (0.5 + rand()) - rand() * 2,
      radius: size,
      life: 1,
      maxLife: life,
      color,
      role: 'impact',
      rotation: 0,
      angularVelocity: 0,
    });
  }

  return particles;
}

const STYLIZED_PARTICLE_COUNTS = { none: 0, low: 3, medium: 6, high: 8 };

export function spawnStylizedImpactParticles(
  impactPoint: Point,
  config: ShatterConfig,
  seed: number,
  strikeVector: Point,
): Particle[] {
  const count = STYLIZED_PARTICLE_COUNTS[config.particles];
  const rand = createPRNG(seed + 2100);
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const isDust = i >= Math.ceil(count * 0.7);
    const radialAngle = (rand() - 0.5) * Math.PI * 0.9;
    const cos = Math.cos(radialAngle);
    const sin = Math.sin(radialAngle);
    const dx = strikeVector.x * cos - strikeVector.y * sin;
    const dy = strikeVector.x * sin + strikeVector.y * cos;
    const speed = isDust ? 0.25 + rand() * 0.7 : 3.6 + rand() * 3.2;
    particles.push({
      x: impactPoint.x + (rand() - 0.5) * (isDust ? 14 : 8),
      y: impactPoint.y + (rand() - 0.5) * (isDust ? 14 : 8),
      vx: isDust ? (rand() - 0.5) * speed : dx * speed,
      vy: isDust ? (rand() - 0.5) * speed - 0.2 : dy * speed - rand() * 0.5,
      radius: isDust ? 0.8 + rand() * 1.1 : 0.7 + rand() * 1.4,
      life: 1,
      maxLife: isDust ? 80 + rand() * 100 : 100 + rand() * 120,
      color: isDust ? 'rgba(210,198,184,1)' : 'rgba(255,232,204,1)',
      role: isDust ? 'dust' : 'chip',
      rotation: rand() * Math.PI * 2,
      angularVelocity: (rand() * 2 - 1) * 0.3,
    });
  }
  return particles;
}

export function spawnExtinctionMotes(
  origin: Point,
  inheritedVelocity: Point,
  seed: number,
  whispIndex: number,
): Particle[] {
  const rand = createPRNG(seed + 5200 + whispIndex * 131);
  const count = 1 + Math.floor(rand() * 2);
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: origin.x + (rand() - 0.5) * 5,
      y: origin.y + (rand() - 0.5) * 5,
      vx: inheritedVelocity.x * 0.08 + (rand() - 0.5) * 0.5,
      vy: inheritedVelocity.y * 0.05 - 0.35 - rand() * 0.55,
      radius: 0.6 + rand() * 0.8,
      life: 1,
      maxLife: 130 + rand() * 120,
      color: 'rgba(244,240,232,1)',
      role: 'extinction',
      rotation: 0,
      angularVelocity: 0,
    });
  }
  return particles;
}

/** Update particles in place. Returns false when all dead */
export function updateParticles(particles: Particle[], dtMs: number, gravity: number): boolean {
  const grav = gravity * 0.005;
  let anyAlive = false;
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += grav * dtMs * 0.1;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.rotation += p.angularVelocity;
    p.life = Math.max(0, p.life - dtMs / p.maxLife);
    if (p.life > 0) anyAlive = true;
  }
  return anyAlive;
}
