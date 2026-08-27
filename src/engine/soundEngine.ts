import { createPRNG } from './fractureGenerator';
import type { AudioProfile, ObjectWeight } from '../types/destructionStyle';
import type { ShatterFragment } from '../types/shatter';

export type ObjectWeightClass = Exclude<ObjectWeight, 'auto'>;

interface PotSoundProfile {
  body: {
    filterFrequency: number;
    decay: number;
    noiseGain: number;
    resonanceGain: number;
    partials: readonly number[];
  };
  crack: {
    highpass: number;
    bandpass: number;
    decay: number;
    gain: number;
    resonances: readonly number[];
    resonanceDecay: readonly [number, number];
  };
  clinks: {
    count: readonly [number, number];
    frequency: readonly [number, number];
    decay: readonly [number, number];
    delayMax: number;
    gain: number;
  };
  debris: {
    duration: number;
    highpass: number;
    density: number;
    gain: number;
  };
}

const POT_SOUND_PROFILES: Readonly<Record<ObjectWeightClass, PotSoundProfile>> = {
  small: {
    body: { filterFrequency: 520, decay: 0.052, noiseGain: 0.1, resonanceGain: 0.075, partials: [235, 410] },
    crack: { highpass: 1550, bandpass: 3900, decay: 0.052, gain: 0.72, resonances: [1950, 3250, 5100], resonanceDecay: [0.022, 0.044] },
    clinks: { count: [3, 5], frequency: [3800, 6800], decay: [0.022, 0.048], delayMax: 0.11, gain: 0.08 },
    debris: { duration: 0.11, highpass: 1700, density: 0.0035, gain: 0.075 },
  },
  medium: {
    body: { filterFrequency: 360, decay: 0.086, noiseGain: 0.15, resonanceGain: 0.105, partials: [155, 285] },
    crack: { highpass: 1050, bandpass: 3050, decay: 0.072, gain: 0.76, resonances: [1370, 2380, 4050], resonanceDecay: [0.03, 0.058] },
    clinks: { count: [3, 5], frequency: [2750, 5700], decay: [0.03, 0.062], delayMax: 0.15, gain: 0.085 },
    debris: { duration: 0.17, highpass: 1250, density: 0.0045, gain: 0.09 },
  },
  large: {
    body: { filterFrequency: 245, decay: 0.13, noiseGain: 0.2, resonanceGain: 0.135, partials: [102, 194, 330] },
    crack: { highpass: 720, bandpass: 2450, decay: 0.092, gain: 0.79, resonances: [930, 1740, 3180], resonanceDecay: [0.042, 0.082] },
    clinks: { count: [4, 6], frequency: [1850, 4900], decay: [0.038, 0.082], delayMax: 0.2, gain: 0.09 },
    debris: { duration: 0.24, highpass: 900, density: 0.0058, gain: 0.105 },
  },
  heavy: {
    body: { filterFrequency: 175, decay: 0.175, noiseGain: 0.245, resonanceGain: 0.16, partials: [72, 132, 242] },
    crack: { highpass: 520, bandpass: 2050, decay: 0.115, gain: 0.82, resonances: [640, 1190, 2680], resonanceDecay: [0.055, 0.11] },
    clinks: { count: [4, 7], frequency: [1300, 4300], decay: [0.046, 0.105], delayMax: 0.25, gain: 0.095 },
    debris: { duration: 0.31, highpass: 680, density: 0.0072, gain: 0.12 },
  },
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  return audioCtx;
}

let activeSources: AudioScheduledSourceNode[] = [];

/**
 * Authorize Web Audio while the browser is still handling a real user gesture.
 *
 * Safari is more reliable when the gesture both resumes the context and starts a
 * silent source. Callers must invoke this synchronously from their click/tap
 * handler, before any timers, promises, generation, or playback work.
 */
export function unlockAudioFromUserGesture(): void {
  try {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * 0.02)), ctx.sampleRate);
    const silentGain = ctx.createGain();
    silentGain.gain.setValueAtTime(0, ctx.currentTime);
    source.connect(silentGain);
    silentGain.connect(ctx.destination);
    source.onended = () => {
      source.disconnect();
      silentGain.disconnect();
    };
    source.start(ctx.currentTime);
    requestAudioResume(ctx);
  } catch (error) {
    console.warn('Audio unlock failed:', error);
  }
}

/** Resume audio context (required after user interaction) */
export async function resumeAudio() {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') await ctx.resume();
}

function requestAudioResume(ctx: AudioContext): void {
  if (ctx.state === 'running') return;
  void ctx.resume().catch(error => {
    console.warn('Audio resume failed:', error);
  });
}

/** Stop all currently playing shatter sounds */
export function stopAllSounds() {
  for (const src of activeSources) {
    try {
      src.stop();
    } catch {
      // Ignore if already stopped
    }
  }
  activeSources = [];
}

function trackSource(src: AudioScheduledSourceNode) {
  activeSources.push(src);
  src.onended = () => {
    const idx = activeSources.indexOf(src);
    if (idx !== -1) activeSources.splice(idx, 1);
  };
}

/** Generate and play procedural ceramic smash sound */
export function playSmashSound(seed: number, volume = 1.0) {
  try {
    const ctx = getAudioContext();
    requestAudioResume(ctx);

    const rand = createPRNG(seed + 9999);
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, now);
    masterGain.connect(ctx.destination);

    // 1. IMPACT THUMP
    playImpact(ctx, masterGain, now, rand);

    // 2. CRACK
    playCrack(ctx, masterGain, now + 0.01, rand);

    // 3. CLINKS
    const clinkCount = Math.floor(rand() * 4) + 4;
    for (let i = 0; i < clinkCount; i++) {
      const delay = rand() * 0.18 + 0.02;
      playClink(ctx, masterGain, now + delay, rand);
    }

    // 4. DEBRIS TAIL
    playDebris(ctx, masterGain, now + 0.08, rand);

  } catch (e) {
    console.warn('Audio failed:', e);
  }
}

export function resolveObjectWeightClass(
  requested: ObjectWeight,
  fragments: readonly ShatterFragment[],
  svgWidth: number,
  svgHeight: number,
): ObjectWeightClass {
  if (requested !== 'auto') return requested;
  const viewBoxArea = Math.max(1, svgWidth * svgHeight);
  const visibleArea = fragments.reduce((sum, fragment) => sum + fragment.visibleArea, 0);
  const points = fragments.flatMap(fragment => fragment.hullPolygon);
  if (points.length === 0 || !Number.isFinite(visibleArea)) return 'medium';
  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const visibleWidth = Math.max(1, maxX - minX);
  const visibleHeight = Math.max(1, maxY - minY);
  const visibleBoundsArea = visibleWidth * visibleHeight;
  const coverage = clamp01(visibleBoundsArea / viewBoxArea);
  const solidity = clamp01(visibleArea / visibleBoundsArea);
  const compactness = Math.min(visibleWidth, visibleHeight) / Math.max(visibleWidth, visibleHeight);
  const sourceExtentHint = clamp01(Math.sqrt(viewBoxArea) / 1000);
  const score = coverage * 0.45 + solidity * 0.25 + compactness * 0.15 + sourceExtentHint * 0.15;
  if (score < 0.3) return 'small';
  if (score < 0.52) return 'medium';
  if (score < 0.7) return 'large';
  return 'heavy';
}

export function playStylizedImpactSound(
  seed: number,
  profile: Extract<AudioProfile, { kind: 'stylized' }>,
  weight: ObjectWeightClass,
  volume = 1,
) {
  try {
    const ctx = getAudioContext();
    requestAudioResume(ctx);
    const rand = createPRNG(seed + 12000);
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(volume * 0.74, now);
    const limiter = createCeramicLimiter(ctx);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    scheduleStylizedCeramicImpact(ctx, master, now, rand, weight, profile, true);
  } catch (error) {
    console.warn('Stylized audio failed:', error);
  }
}

export function playWhispSound(seed: number, level: number) {
  if (level <= 0) return;
  try {
    const ctx = getAudioContext();
    const rand = createPRNG(seed + 13000);
    const now = ctx.currentTime;
    const duration = 0.14 + rand() * 0.06;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) {
      const envelope = Math.sin(Math.PI * index / data.length) ** 1.5;
      data[index] = (rand() * 2 - 1) * envelope;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(900, now);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1800, now);
    lowpass.frequency.exponentialRampToValueAtTime(3300, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.1 * Math.min(1, level), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    trackSource(source);
  } catch (error) {
    console.warn('Whisp audio failed:', error);
  }
}

function scheduleStylizedCeramicImpact(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  rand: () => number,
  weight: ObjectWeightClass,
  audioProfile: Extract<AudioProfile, { kind: 'stylized' }>,
  track: boolean,
) {
  const soundProfile = POT_SOUND_PROFILES[weight];
  playCeramicCrack(ctx, destination, when, rand, soundProfile, track);
  playCeramicBody(ctx, destination, when + 0.006, rand, soundProfile, audioProfile.impactWeight, track);

  const debrisLevel = clamp01(audioProfile.debrisLevel);
  const [minimumClinks, maximumClinks] = soundProfile.clinks.count;
  const clinkCount = debrisLevel <= 0.01
    ? 0
    : Math.round(minimumClinks * Math.sqrt(debrisLevel) + (maximumClinks - minimumClinks) * debrisLevel);
  for (let index = 0; index < clinkCount; index++) {
    const delay = 0.012 + rand() * soundProfile.clinks.delayMax;
    playCeramicClink(ctx, destination, when + delay, rand, soundProfile, debrisLevel, track);
  }
  if (debrisLevel > 0.01) {
    playCeramicDebris(ctx, destination, when + 0.055, rand, soundProfile, debrisLevel, track);
  }
}

function playCeramicBody(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  rand: () => number,
  profile: PotSoundProfile,
  impactWeight: number,
  track: boolean,
) {
  const weightGain = 0.12 + clamp01(impactWeight) * 0.88;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, profile.body.decay, rand, 1.8);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(profile.body.filterFrequency * (0.94 + rand() * 0.12), when);
  filter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, when);
  noiseGain.gain.linearRampToValueAtTime(profile.body.noiseGain * weightGain, when + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, when + profile.body.decay);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(destination);
  noise.start(when);
  if (track) trackSource(noise);

  profile.body.partials.forEach((baseFrequency, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = index % 2 === 0 ? 'triangle' : 'sine';
    const frequency = baseFrequency * (0.95 + rand() * 0.1);
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * (0.76 + rand() * 0.1)), when + profile.body.decay);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.linearRampToValueAtTime(profile.body.resonanceGain * weightGain / (1 + index * 0.36), when + 0.0025);
    gain.gain.exponentialRampToValueAtTime(0.001, when + profile.body.decay * (0.74 + index * 0.1));
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + profile.body.decay + 0.015);
    if (track) trackSource(oscillator);
  });
}

function playCeramicCrack(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  rand: () => number,
  profile: PotSoundProfile,
  track: boolean,
) {
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, profile.crack.decay, rand, 3.4);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(profile.crack.highpass * (0.92 + rand() * 0.16), when);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(profile.crack.bandpass * (0.9 + rand() * 0.2), when);
  bandpass.Q.value = 0.55;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.linearRampToValueAtTime(profile.crack.gain, when + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.001, when + profile.crack.decay);
  source.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(destination);
  source.start(when);
  if (track) trackSource(source);

  profile.crack.resonances.forEach((baseFrequency, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = index === 1 ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(baseFrequency * (0.93 + rand() * 0.14), when);
    const decay = lerp(profile.crack.resonanceDecay[0], profile.crack.resonanceDecay[1], rand());
    const resonanceGain = ctx.createGain();
    resonanceGain.gain.setValueAtTime(0.001, when);
    resonanceGain.gain.linearRampToValueAtTime(0.095 / (1 + index * 0.22), when + 0.0015);
    resonanceGain.gain.exponentialRampToValueAtTime(0.001, when + decay);
    oscillator.connect(resonanceGain);
    resonanceGain.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + decay + 0.01);
    if (track) trackSource(oscillator);
  });
}

function playCeramicClink(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  rand: () => number,
  profile: PotSoundProfile,
  debrisLevel: number,
  track: boolean,
) {
  const frequency = lerp(profile.clinks.frequency[0], profile.clinks.frequency[1], rand());
  const decay = lerp(profile.clinks.decay[0], profile.clinks.decay[1], rand());
  const oscillator = ctx.createOscillator();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, when);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * (0.84 + rand() * 0.08), when + decay);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.linearRampToValueAtTime(profile.clinks.gain * (0.35 + debrisLevel * 0.65), when + 0.0012);
  gain.gain.exponentialRampToValueAtTime(0.001, when + decay);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(when);
  oscillator.stop(when + decay + 0.01);
  if (track) trackSource(oscillator);

  const click = ctx.createBufferSource();
  click.buffer = createNoiseBuffer(ctx, Math.min(0.018, decay), rand, 5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 1.2;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(profile.clinks.gain * (0.18 + debrisLevel * 0.25), when);
  clickGain.gain.exponentialRampToValueAtTime(0.001, when + Math.min(0.018, decay));
  click.connect(filter);
  filter.connect(clickGain);
  clickGain.connect(destination);
  click.start(when);
  if (track) trackSource(click);
}

function playCeramicDebris(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
  rand: () => number,
  profile: PotSoundProfile,
  level: number,
  track: boolean,
) {
  const source = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * profile.debris.duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const density = profile.debris.density * (0.25 + level * 0.75);
  for (let index = 0; index < data.length; index++) {
    const envelope = Math.exp(-index / Math.max(1, data.length * 0.46));
    data[index] = rand() < density ? (rand() * 2 - 1) * envelope : 0;
  }
  source.buffer = buffer;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = profile.debris.highpass;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(profile.debris.gain * (0.25 + level * 0.75), when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + profile.debris.duration);
  source.connect(highpass);
  highpass.connect(gain);
  gain.connect(destination);
  source.start(when);
  if (track) trackSource(source);
}

function createNoiseBuffer(
  ctx: BaseAudioContext,
  duration: number,
  rand: () => number,
  decayPower: number,
): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) {
    const envelope = (1 - index / data.length) ** decayPower;
    data[index] = (rand() * 2 - 1) * envelope;
  }
  return buffer;
}

function createCeramicLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 4;
  limiter.ratio.value = 3;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.08;
  return limiter;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function playImpact(ctx: AudioContext, dest: AudioNode, when: number, rand: () => number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(dest);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(55 + rand() * 30, when);
  osc.frequency.exponentialRampToValueAtTime(20, when + 0.08);

  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.9, when + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);

  osc.start(when);
  osc.stop(when + 0.09);
  trackSource(osc);
}

function playCrack(ctx: AudioContext, dest: AudioNode, when: number, rand: () => number) {
  const bufferSize = ctx.sampleRate * 0.12;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (rand() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300 + rand() * 200;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6000 + rand() * 2000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(dest);

  src.start(when);
  trackSource(src);
}

function playClink(ctx: AudioContext, dest: AudioNode, when: number, rand: () => number) {
  const freq = 2200 + rand() * 2800;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(dest);

  osc.type = 'sine';
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.15, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.06 + rand() * 0.04);

  osc.start(when);
  osc.stop(when + 0.12);
  trackSource(osc);
}

function playDebris(ctx: AudioContext, dest: AudioNode, when: number, rand: () => number) {
  const bufferSize = ctx.sampleRate * 0.35;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = rand() > 0.985 ? (rand() * 2 - 1) * 0.5 : 0;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.35);

  src.connect(hp);
  hp.connect(gain);
  gain.connect(dest);

  src.start(when);
  trackSource(src);
}

let customAudioBuffer: AudioBuffer | null = null;
let customAudioFileName: string | null = null;
let customAudioBase64: string | null = null;

export async function loadCustomSound(file: File): Promise<{ fileName: string; duration: number }> {
  stopAllSounds();
  const ctx = getAudioContext();
  if (ctx.state !== 'running') await ctx.resume();

  const arrayBuffer = await file.arrayBuffer();
  customAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
  customAudioFileName = file.name;
  
  // Convert File to base64 Data URL for standalone export
  const reader = new FileReader();
  customAudioBase64 = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
  
  return {
    fileName: file.name,
    duration: customAudioBuffer.duration
  };
}

export async function loadCustomSoundFromUrl(url: string) {
  stopAllSounds();
  const ctx = getAudioContext();
  if (ctx.state !== 'running') await ctx.resume();

  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  customAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
  customAudioFileName = 'custom-audio';
  customAudioBase64 = url;
}

export function clearCustomSound() {
  stopAllSounds();
  customAudioBuffer = null;
  customAudioFileName = null;
  customAudioBase64 = null;
}

export function getCustomSoundMetadata() {
  if (!customAudioBuffer) return null;
  return {
    fileName: customAudioFileName,
    duration: customAudioBuffer.duration,
    dataUrl: customAudioBase64
  };
}

/** Play custom uploaded audio file from cached buffer */
export function playCustomSound(volume = 1.0) {
  if (!customAudioBuffer) return;
  
  const ctx = getAudioContext();
  requestAudioResume(ctx);

  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = customAudioBuffer;
  gain.gain.value = volume;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
  trackSource(src);
}

/** Render procedural sound to AudioBuffer (for export) */
export async function renderSmashToBuffer(seed: number): Promise<AudioBuffer | null> {
  try {
    const OfflineAudioCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const offlineCtx = new OfflineAudioCtx(1, 44100, 44100);
    const rand = createPRNG(seed + 9999);
    const now = 0;

    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(offlineCtx.destination);

    // (same as playSmashSound but using offlineCtx)
    renderImpact(offlineCtx, masterGain, now, rand);
    renderCrack(offlineCtx, masterGain, now + 0.01, rand);
    const clinkCount = Math.floor(rand() * 4) + 4;
    for (let i = 0; i < clinkCount; i++) {
      const delay = rand() * 0.18 + 0.02;
      renderClink(offlineCtx, masterGain, now + delay, rand);
    }
    renderDebris(offlineCtx, masterGain, now + 0.08, rand);

    return await offlineCtx.startRendering();
  } catch {
    return null;
  }
}

function renderImpact(ctx: OfflineAudioContext, dest: AudioNode, when: number, rand: () => number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(dest);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(55 + rand() * 30, when);
  osc.frequency.exponentialRampToValueAtTime(20, when + 0.08);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.9, when + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
  osc.start(when); osc.stop(when + 0.09);
}

function renderCrack(ctx: OfflineAudioContext, dest: AudioNode, when: number, rand: () => number) {
  const bufferSize = ctx.sampleRate * 0.12;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (rand() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
  src.connect(hp); hp.connect(gain); gain.connect(dest);
  src.start(when);
}

function renderClink(ctx: OfflineAudioContext, dest: AudioNode, when: number, rand: () => number) {
  const freq = 2200 + rand() * 2800;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(dest);
  osc.type = 'sine'; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.15, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
  osc.start(when); osc.stop(when + 0.12);
}

function renderDebris(ctx: OfflineAudioContext, dest: AudioNode, when: number, rand: () => number) {
  const bufferSize = ctx.sampleRate * 0.35;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = rand() > 0.985 ? (rand() * 2 - 1) * 0.5 : 0;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.35);
  src.connect(hp); hp.connect(gain); gain.connect(dest);
  src.start(when);
}
