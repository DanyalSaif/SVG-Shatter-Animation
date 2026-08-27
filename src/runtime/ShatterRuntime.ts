import { ShatterConfig, ShatterFragment, Point, Particle, PlaybackState } from '../types/shatter';
import { StageTransform, calculateStageTransform, sourceToStage } from './StageTransform';
import { PhysicsState, createPhysicsState, addFragmentBodies, applyImpact, syncFragmentsFromBodies, stepPhysics, destroyPhysicsState } from '../engine/physicsEngine';
import { spawnParticles, spawnStylizedImpactParticles, spawnExtinctionMotes, updateParticles } from '../engine/particleEngine';
import { playSmashSound, playStylizedImpactSound, playWhispSound, resolveObjectWeightClass, playCustomSound, stopAllSounds } from '../engine/soundEngine';
import { renderFrame } from '../engine/renderer';
import type { DestructionExecutionConfig } from '../types/destructionStyle';
import { createPhysicalExecution, timelineProgress } from './ShatterTimeline';
import { getStrikeVisualState } from '../engine/strikeEngine';
import { allFragmentsDead, createFragmentLifecycles, updateFragmentLifecycles } from '../engine/fragmentLifecycle';
import type { FragmentRuntimeState } from '../engine/fragmentLifecycle';
import { allWhispsDead, createWhisp, selectWhispAnchorIds, updateWhisps } from '../engine/whispEngine';
import type { Whisp } from '../engine/whispEngine';
import type { ObjectWeightClass } from '../engine/soundEngine';
import {
  allSmokeDead,
  createCentralSmokePuffs,
  createShardSmokePuffs,
  selectShardSmokeIds,
  updateSmoke,
} from '../engine/smokeEngine';
import type { SmokePuff } from '../engine/smokeEngine';
import { getRenderDpr } from './renderLimits';

export interface ShatterRuntimeOptions {
  canvas: HTMLCanvasElement;
  fragments: ShatterFragment[];
  config: ShatterConfig;
  svgWidth: number;
  svgHeight: number;
  seed: number;
  svgImage?: HTMLImageElement | null;
  onPlaybackChange?: (state: PlaybackState) => void;
  onComplete?: () => void;
  stageTransform?: StageTransform;
  execution?: DestructionExecutionConfig;
  resolvedObjectWeight?: ObjectWeightClass;
}

const SHAKE_STRENGTH = { none: 0, low: 1.5, medium: 3.5, high: 7 };
const SHAKE_DURATION = { none: 0, low: 80, medium: 140, high: 200 };

export class ShatterRuntime {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public dpr: number;
  public fragments: ShatterFragment[];
  public config: ShatterConfig;
  public execution: DestructionExecutionConfig;
  public svgWidth: number;
  public svgHeight: number;
  public seed: number;
  public svgImage: HTMLImageElement | null = null;
  
  public stageTransform: StageTransform;
  
  public physicsState: PhysicsState | null = null;
  public particles: Particle[] = [];
  public fragmentStates = new Map<number, FragmentRuntimeState>();
  public whisps: Whisp[] = [];
  public smoke: SmokePuff[] = [];
  public playbackState: PlaybackState = 'idle';
  
  public elapsedMs = 0;
  public shakeX = 0;
  public shakeY = 0;
  public flashAlpha = 0;
  public showOriginal = true;
  public impactPoint: Point = { x: 0, y: 0 };
  
  private rafId: number | null = null;
  private lastTimestamp: number | null = null;
  private onPlaybackChange?: (state: PlaybackState) => void;
  private onComplete?: () => void;
  private motionStarted = false;
  private simulatedMotionMs = 0;
  private whispAnchorIds = new Set<number>();
  private shardSmokeAnchorIds = new Set<number>();
  private resolvedObjectWeightOverride?: ObjectWeightClass;
  private resolvedObjectWeight: ObjectWeightClass = 'medium';
  private objectExtent = 1;
  private runId = 0;
  private events = {
    impactTriggered: false,
    fractureTriggered: false,
    centralSmokeTriggered: false,
    motionTriggered: false,
    whispAudioTriggered: false,
    completionTriggered: false,
  };
  
  // Transform from Stage Space to Canvas rendering space
  private canvasScale = 1;
  private canvasOffsetX = 0;
  private canvasOffsetY = 0;

  constructor(opts: ShatterRuntimeOptions) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = getRenderDpr();
    this.fragments = opts.fragments;
    this.config = opts.config;
    this.execution = opts.execution ?? createPhysicalExecution(opts.config);
    this.svgWidth = opts.svgWidth;
    this.svgHeight = opts.svgHeight;
    this.seed = opts.seed;
    this.svgImage = opts.svgImage || null;
    this.objectExtent = calculateVisibleExtent(opts.fragments, opts.svgWidth, opts.svgHeight);
    this.onPlaybackChange = opts.onPlaybackChange;
    this.onComplete = opts.onComplete;
    this.resolvedObjectWeightOverride = opts.resolvedObjectWeight;
    
    // Calculate logical stage dimensions based on SVG aspect ratio unless provided
    this.stageTransform = opts.stageTransform ?? calculateStageTransform(this.svgWidth, this.svgHeight);
    
    this.updateDisplayTransform();
  }

  public updateConfig(config: ShatterConfig, execution?: DestructionExecutionConfig) {
    this.config = config;
    this.execution = execution ?? createPhysicalExecution(config);
  }

  /** Calculates how to fit the logical Stage into the physical Canvas */
  public updateDisplayTransform() {
    const { width: canvasW, height: canvasH } = this.canvas.getBoundingClientRect();
    const scaleX = canvasW / this.stageTransform.stageWidth;
    const scaleY = canvasH / this.stageTransform.stageHeight;
    
    this.canvasScale = Math.min(scaleX, scaleY);
    this.canvasOffsetX = (canvasW - this.stageTransform.stageWidth * this.canvasScale) / 2;
    this.canvasOffsetY = (canvasH - this.stageTransform.stageHeight * this.canvasScale) / 2;
  }

  public resize() {
    this.updateDisplayTransform();
    if (this.playbackState === 'idle') {
      this.drawFrame();
    }
  }

  public setStageTransform(transform: StageTransform) {
    this.stop();
    if (this.physicsState) {
      destroyPhysicsState(this.physicsState);
      this.physicsState = null;
    }
    this.stageTransform = transform;
    this.updateDisplayTransform();
    this.reset();
  }

  public play(customImpactPointSourceSpace?: Point) {
    this.stop();
    
    if (this.fragments.length === 0) {
      console.warn('Cannot play: no fragments generated');
      return;
    }

    if (customImpactPointSourceSpace) {
      this.impactPoint = customImpactPointSourceSpace;
    }

    // Reset fragments
    this.fragments.forEach(f => {
      f.x = f.initialX;
      f.y = f.initialY;
      f.angle = 0;
      f.velocityX = 0;
      f.velocityY = 0;
      f.angularVelocity = 0;
    });

    // Initialize physics with the Stage limits
    if (this.physicsState) {
      destroyPhysicsState(this.physicsState);
      this.physicsState = null;
    }
    const initialGravityScale = this.execution.motionProfile.kind === 'stylized'
      ? this.execution.motionProfile.gravity.initialScale
      : 1;
    this.physicsState = createPhysicsState(this.config, this.stageTransform.stageHeight, initialGravityScale);
    addFragmentBodies(this.physicsState, this.fragments, this.config, this.stageTransform);
    
    if (!this.physicsState || this.physicsState.bodies.size === 0) {
      console.warn('Cannot play: physics engine failed to initialize bodies');
      return;
    }

    this.showOriginal = true;
    this.elapsedMs = 0;
    this.particles = [];
    this.flashAlpha = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.lastTimestamp = null;
    this.motionStarted = false;
    this.simulatedMotionMs = 0;
    this.resetStylizedState();

    this.playbackState = 'playing';
    this.onPlaybackChange?.('playing');

    this.rafId = requestAnimationFrame((ts) => this.animationLoop(ts));
  }

  public stop() {
    this.runId++;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    stopAllSounds();
  }

  public reset() {
    this.stop();
    if (this.physicsState) {
      destroyPhysicsState(this.physicsState);
      this.physicsState = null;
    }
    this.showOriginal = true;
    this.elapsedMs = 0;
    this.flashAlpha = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.particles = [];
    this.fragmentStates.clear();
    this.whisps = [];
    this.smoke = [];
    this.whispAnchorIds.clear();
    this.shardSmokeAnchorIds.clear();
    this.motionStarted = false;
    this.simulatedMotionMs = 0;
    this.resetEvents();
    this.playbackState = 'idle';
    this.onPlaybackChange?.('idle');
    this.drawFrame();
  }

  private animationLoop(timestamp: number) {
    if (this.lastTimestamp === null) this.lastTimestamp = timestamp;
    const dt = Math.min(timestamp - this.lastTimestamp, 33);
    this.lastTimestamp = timestamp;
    this.elapsedMs += dt;
    const t = this.elapsedMs;

    this.updateFlash(t, dt);
    this.triggerImpact(t);
    if (this.execution.motionProfile.kind === 'physical') {
      this.runPhysicalFrame(t, dt);
    } else {
      this.runStylizedFrame(t);
    }

    this.drawFrame();
    if (this.shouldContinue(t)) {
      this.rafId = requestAnimationFrame((nextTimestamp) => this.animationLoop(nextTimestamp));
    } else if (!this.events.completionTriggered) {
      this.events.completionTriggered = true;
      this.rafId = null;
      if (this.execution.extinctionProfile.kind === 'stylized') {
        this.whisps = [];
        this.smoke = [];
        this.particles.length = 0;
        this.whispAnchorIds.clear();
        this.shardSmokeAnchorIds.clear();
        stopAllSounds();
      }
      this.playbackState = 'settled';
      this.onPlaybackChange?.('settled');
      this.onComplete?.();
    }
  }

  private updateFlash(elapsed: number, frameDelta: number) {
    const flashEnd = this.execution.timeline.impact + 30;
    if (elapsed >= this.execution.timeline.impact && elapsed <= flashEnd) {
      const flashProgress = timelineProgress(elapsed, this.execution.timeline.impact, flashEnd);
      this.flashAlpha = Math.sin(flashProgress * Math.PI) * 0.85;
    } else if (elapsed > flashEnd) {
      this.flashAlpha = Math.max(0, this.flashAlpha - frameDelta / 80);
    }
  }

  private triggerImpact(elapsed: number) {
    if (this.events.impactTriggered || elapsed < this.execution.timeline.impact) return;
    this.events.impactTriggered = true;

    if (this.execution.motionProfile.kind === 'stylized') {
      this.particles.push(...spawnStylizedImpactParticles(
        this.impactPoint,
        this.config,
        this.seed,
        this.execution.motionProfile.strikeVector,
      ));
    }

    if (!this.config.sound) return;
    if (this.config.soundSource === 'custom') {
      playCustomSound(this.config.customSoundVolume);
    } else if (this.execution.audioProfile.kind === 'stylized') {
      playStylizedImpactSound(
        this.seed,
        this.execution.audioProfile,
        this.resolvedObjectWeight,
      );
    } else {
      playSmashSound(this.seed);
    }
  }

  private runPhysicalFrame(elapsed: number, _frameDelta: number) {
    const timeline = this.execution.timeline;
    if (elapsed < timeline.fracture) {
      this.showOriginal = true;
      const shakeStart = timeline.shakeStart;
      if (shakeStart !== undefined && elapsed >= shakeStart) {
        const strength = SHAKE_STRENGTH[this.config.screenShake];
        const phase = ((elapsed - shakeStart) / 10) * 0.8;
        this.shakeX = Math.sin(phase * Math.PI * 6) * strength * Math.exp(-(elapsed - shakeStart) / 80);
        this.shakeY = Math.cos(phase * Math.PI * 4) * strength * 0.5 * Math.exp(-(elapsed - shakeStart) / 80);
      }
      return;
    }

    if (!this.events.fractureTriggered) {
      this.events.fractureTriggered = true;
      this.showOriginal = false;
    }
    if (!this.events.motionTriggered && elapsed >= timeline.motionStart) {
      this.events.motionTriggered = true;
      this.motionStarted = true;
      applyImpact(
        this.physicsState!, this.fragments, this.impactPoint, this.config,
        this.seed, this.stageTransform, this.execution.motionProfile,
      );
      this.particles = spawnParticles(this.impactPoint, this.config, this.seed);
      syncFragmentsFromBodies(this.physicsState!, this.fragments, this.stageTransform);
    } else if (this.motionStarted) {
      const fixedStep = 1000 / 60;
      const target = Math.max(0, Math.min(elapsed, timeline.complete) - timeline.motionStart);
      while (this.simulatedMotionMs + fixedStep <= target + 0.0001) {
        stepPhysics(this.physicsState!, fixedStep, 1);
        if (!updateParticles(this.particles, fixedStep, this.config.gravity)) this.particles.length = 0;
        this.simulatedMotionMs += fixedStep;
      }
      syncFragmentsFromBodies(this.physicsState!, this.fragments, this.stageTransform);
    }
    this.updatePostImpactShake(elapsed);
  }

  private runStylizedFrame(elapsed: number) {
    const timeline = this.execution.timeline;
    if (elapsed < timeline.fracture) {
      this.showOriginal = true;
      return;
    }

    if (!this.events.fractureTriggered) {
      this.events.fractureTriggered = true;
      this.showOriginal = false;
      this.spawnCentralSmoke();
    }
    if (!this.events.motionTriggered && elapsed >= timeline.motionStart) {
      this.events.motionTriggered = true;
      this.motionStarted = true;
      applyImpact(
        this.physicsState!, this.fragments, this.impactPoint, this.config,
        this.seed, this.stageTransform, this.execution.motionProfile,
      );
      syncFragmentsFromBodies(this.physicsState!, this.fragments, this.stageTransform);
    } else if (this.motionStarted) {
      this.advanceStylizedMotion(elapsed - timeline.motionStart);
    }
    this.updatePostImpactShake(elapsed);
  }

  private advanceStylizedMotion(motionElapsed: number) {
    const profile = this.execution.extinctionProfile;
    if (profile.kind !== 'stylized') return;
    const fixedStep = 1000 / 60;
    const target = Math.max(0, motionElapsed);
    while (this.simulatedMotionMs + fixedStep <= target + 0.0001) {
      const nextTime = this.simulatedMotionMs + fixedStep;
      stepPhysics(this.physicsState!, fixedStep, this.getGravityScale(nextTime));
      const particlesAlive = updateParticles(this.particles, fixedStep, this.config.gravity);
      if (!particlesAlive) this.particles.length = 0;
      syncFragmentsFromBodies(this.physicsState!, this.fragments, this.stageTransform);
      updateFragmentLifecycles(
        this.fragmentStates,
        nextTime,
        profile,
        this.whispAnchorIds,
        (state) => this.spawnWhisp(state),
        this.shardSmokeAnchorIds,
        (state) => this.spawnShardSmoke(state),
      );
      updateWhisps(this.whisps, nextTime);
      updateSmoke(this.smoke, nextTime);
      this.simulatedMotionMs = nextTime;
    }
  }

  private spawnWhisp(state: FragmentRuntimeState) {
    const profile = this.execution.extinctionProfile;
    if (profile.kind !== 'stylized') return;
    const fragment = this.fragments.find(candidate => candidate.id === state.fragmentId);
    if (!fragment) return;
    const whispIndex = this.whisps.length;
    const whisp = createWhisp(
      fragment,
      state.whispSpawnTime,
      profile,
      this.seed,
      whispIndex,
      this.objectExtent,
    );
    this.whisps.push(whisp);
    this.particles.push(...spawnExtinctionMotes(
      whisp.points[0],
      { x: fragment.velocityX, y: fragment.velocityY },
      this.seed,
      whispIndex,
    ));

    if (
      !this.events.whispAudioTriggered
      && this.config.sound
      && this.execution.audioProfile.kind === 'stylized'
      && this.execution.audioProfile.whispLevel > 0
    ) {
      this.events.whispAudioTriggered = true;
      playWhispSound(this.seed, this.execution.audioProfile.whispLevel);
    }
  }

  private spawnCentralSmoke() {
    if (this.events.centralSmokeTriggered) return;
    this.events.centralSmokeTriggered = true;
    const profile = this.execution.smokeProfile;
    if (profile.kind !== 'stylized') return;
    this.smoke.push(...createCentralSmokePuffs({
      profile,
      fallbackPoints: this.fragments.map(fragment => fragment.visibleCentroid),
      svgWidth: this.svgWidth,
      svgHeight: this.svgHeight,
      objectExtent: this.objectExtent,
      impactPoint: this.impactPoint,
      strikeVector: this.execution.strike.vector,
      seed: this.seed,
      spawnTime: Math.max(0, this.execution.timeline.fracture - this.execution.timeline.motionStart),
    }));
  }

  private spawnShardSmoke(state: FragmentRuntimeState) {
    const profile = this.execution.smokeProfile;
    if (profile.kind !== 'stylized') return;
    const fragment = this.fragments.find(candidate => candidate.id === state.fragmentId);
    if (!fragment) return;
    this.smoke.push(...createShardSmokePuffs({
      fragment,
      profile,
      objectExtent: this.objectExtent,
      seed: this.seed,
      puffIndex: this.smoke.length,
      spawnTime: state.smokeSpawnTime,
    }));
  }

  private updatePostImpactShake(elapsed: number) {
    const motionStart = this.execution.timeline.motionStart;
    const duration = SHAKE_DURATION[this.config.screenShake];
    if (duration > 0 && elapsed >= motionStart && elapsed - motionStart < duration) {
      const strength = SHAKE_STRENGTH[this.config.screenShake];
      const phase = ((elapsed - motionStart) / 8) * 0.9;
      const decay = 1 - (elapsed - motionStart) / duration;
      this.shakeX = Math.sin(phase * Math.PI * 7) * strength * decay;
      this.shakeY = Math.cos(phase * Math.PI * 5) * strength * 0.6 * decay;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  private shouldContinue(elapsed: number): boolean {
    if (elapsed < this.execution.timeline.complete) return true;
    if (this.execution.extinctionProfile.kind !== 'stylized') return false;
    const fragmentsActive = !allFragmentsDead(this.fragmentStates);
    const whispsActive = !allWhispsDead(this.whisps);
    const smokeActive = !allSmokeDead(this.smoke);
    const particlesActive = this.particles.some(particle => particle.life > 0);
    return fragmentsActive || smokeActive || whispsActive || particlesActive;
  }

  private resetStylizedState() {
    this.resetEvents();
    this.fragmentStates.clear();
    this.whisps = [];
    this.smoke = [];
    this.whispAnchorIds.clear();
    this.shardSmokeAnchorIds.clear();
    const extinctionProfile = this.execution.extinctionProfile;
    if (extinctionProfile.kind === 'stylized') {
      this.fragmentStates = createFragmentLifecycles(this.fragments, extinctionProfile, this.seed);
      this.whispAnchorIds = selectWhispAnchorIds(
        this.fragments,
        extinctionProfile.whispAmount,
        this.seed,
        this.svgWidth,
        this.svgHeight,
      );
      if (this.execution.smokeProfile.kind === 'stylized') {
        this.shardSmokeAnchorIds = selectShardSmokeIds(
          this.fragments,
          this.execution.smokeProfile.shardAmount,
          this.seed,
        );
      }
    }
    const audioProfile = this.execution.audioProfile;
    this.resolvedObjectWeight = audioProfile.kind === 'stylized'
      ? this.resolvedObjectWeightOverride ?? resolveObjectWeightClass(
          audioProfile.objectWeight,
          this.fragments,
          this.svgWidth,
          this.svgHeight,
        )
      : 'medium';
  }

  private resetEvents() {
    this.events.impactTriggered = false;
    this.events.fractureTriggered = false;
    this.events.centralSmokeTriggered = false;
    this.events.motionTriggered = false;
    this.events.whispAudioTriggered = false;
    this.events.completionTriggered = false;
  }

  private getGravityScale(motionElapsed: number): number {
    const profile = this.execution.motionProfile;
    if (profile.kind === 'physical') return 1;
    if (motionElapsed <= profile.gravity.rampStart) return profile.gravity.initialScale;
    const progress = timelineProgress(
      motionElapsed,
      profile.gravity.rampStart,
      profile.gravity.rampEnd,
    );
    return profile.gravity.initialScale + (1 - profile.gravity.initialScale) * progress;
  }

  public drawFrame() {
    const { width: canvasW, height: canvasH } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Physical anticipation compression is timeline-owned.
    let scaleModifier = 1;
    let compressOffsetX = 0;
    let compressOffsetY = 0;
    
    const compressionEnd = this.execution.timeline.compressionEnd ?? 0;
    if (this.showOriginal && this.elapsedMs > 0 && this.elapsedMs < compressionEnd) {
      const compressAmt = (this.elapsedMs / compressionEnd) * 0.02;
      scaleModifier = 1 - compressAmt;
      
      // Pull toward impact point slightly
      const impactStage = sourceToStage(this.impactPoint, this.stageTransform);
      const centerX = this.stageTransform.stageWidth / 2;
      const centerY = this.stageTransform.stageHeight / 2;
      
      // Move center slightly towards impact
      compressOffsetX = (impactStage.x - centerX) * compressAmt;
      compressOffsetY = (impactStage.y - centerY) * compressAmt;
    }

    // Apply scaling combined with Stage bounds mapping
    const finalScale = this.canvasScale * this.stageTransform.scale * scaleModifier;
    
    const totalOffsetX = this.canvasOffsetX + (this.stageTransform.sourceOffsetX * this.canvasScale) + this.shakeX + (compressOffsetX * this.canvasScale);
    const totalOffsetY = this.canvasOffsetY + (this.stageTransform.sourceOffsetY * this.canvasScale) + this.shakeY + (compressOffsetY * this.canvasScale);

    renderFrame(
      this.ctx, this.fragments, this.particles, this.config,
      this.svgImage, this.showOriginal,
      canvasW, canvasH, this.svgWidth, this.svgHeight,
      this.dpr,
      0, 0, // shake applied to offset above
      this.flashAlpha, this.impactPoint,
      finalScale, totalOffsetX, totalOffsetY,
      getStrikeVisualState(
        this.elapsedMs,
        this.execution.timeline,
        this.execution.strike,
        this.impactPoint,
        this.stageTransform,
      ),
      this.execution.extinctionProfile.kind === 'stylized' ? this.fragmentStates : undefined,
      this.whisps,
      this.smoke,
      this.execution.motionProfile.kind === 'stylized' ? this.execution.visualProfile : undefined,
    );
  }

  public destroy() {
    this.stop();
    if (this.physicsState) {
      destroyPhysicsState(this.physicsState);
      this.physicsState = null;
    }
    this.particles.length = 0;
    this.whisps.length = 0;
    this.smoke.length = 0;
    this.fragmentStates.clear();
    this.onPlaybackChange = undefined;
    this.onComplete = undefined;
  }

  /** Convert a client pixel coordinate on the canvas to SVG source space */
  public canvasToSourceSpace(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    
    // Remove canvas offset
    const stageX = (cx - this.canvasOffsetX) / this.canvasScale;
    const stageY = (cy - this.canvasOffsetY) / this.canvasScale;
    
    // Remove stage offset and scale
    return {
      x: (stageX - this.stageTransform.sourceOffsetX) / this.stageTransform.scale,
      y: (stageY - this.stageTransform.sourceOffsetY) / this.stageTransform.scale
    };
  }
}

function calculateVisibleExtent(
  fragments: readonly ShatterFragment[],
  svgWidth: number,
  svgHeight: number,
): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const fragment of fragments) {
    for (const point of fragment.hullPolygon) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  const fallback = Math.max(1, Math.hypot(svgWidth, svgHeight));
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return fallback;
  return Math.max(1, Math.min(fallback, Math.hypot(maxX - minX, maxY - minY)));
}
