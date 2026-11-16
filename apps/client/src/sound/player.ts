import type { Team } from '@mam/engine';
import type { ServerMessage } from '@mam/protocol';
import { storage } from '../storage';
import { type Noise, type Recipe, SOUNDS, type SoundName, type Tone } from './manifest';

/**
 * Plays the game's sounds through Web Audio. Browsers only let a page make sound after the
 * player has interacted with it, so the audio context starts on the first click or key. Does
 * nothing where Web Audio is missing (tests, old browsers) or while muted.
 */
class SoundPlayer {
  private ctx: AudioContext | null = null;
  private muted = storage.muted();
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    storage.setMuted(muted);
  }

  /** Starts (or resumes) audio on the player's first interaction. Returns a cleanup. */
  unlockOnGesture(): () => void {
    const unlock = () => {
      const ctx = this.context();
      if (ctx?.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.context();
    if (ctx?.state !== 'running') return;
    const entry = SOUNDS[name];
    const out = ctx.createGain();
    out.gain.value = entry.volume;
    out.connect(ctx.destination);
    if (entry.src) void this.playFile(ctx, entry.src, out);
    else synthesize(ctx, entry.synth, out);
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
    } catch {
      return null;
    }
    return this.ctx;
  }

  private async playFile(ctx: AudioContext, src: string, out: AudioNode): Promise<void> {
    let buffer = this.buffers.get(src);
    if (!buffer) {
      buffer = fetch(src)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(src, buffer);
    }
    const decoded = await buffer;
    if (!decoded) return;
    const node = ctx.createBufferSource();
    node.buffer = decoded;
    node.connect(out);
    node.start();
  }
}

function synthesize(ctx: AudioContext, recipe: Recipe, out: AudioNode): void {
  const now = ctx.currentTime;
  for (const tone of recipe.tones ?? []) playTone(ctx, tone, now, out);
  for (const noise of recipe.noise ?? []) playNoise(ctx, noise, now, out);
}

/** A gain envelope: a fast attack, then an exponential fade over `dur`. */
function envelope(ctx: AudioContext, at: number, dur: number, peak: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  return gain;
}

function playTone(ctx: AudioContext, tone: Tone, now: number, out: AudioNode): void {
  const at = now + tone.start;
  const osc = ctx.createOscillator();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq, at);
  if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, at + tone.dur);
  const gain = envelope(ctx, at, tone.dur, tone.gain);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + tone.dur + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;

function playNoise(ctx: AudioContext, noise: Noise, now: number, out: AudioNode): void {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const at = now + noise.start;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = noise.band;
  filter.Q.value = 1.2;
  const gain = envelope(ctx, at, noise.dur, noise.gain);
  src.connect(filter).connect(gain).connect(out);
  src.start(at);
  src.stop(at + noise.dur + 0.02);
}

export const sound = new SoundPlayer();

/**
 * The sounds a server message calls for. `team` is the viewer's side, so the end of a hand
 * sounds like good news when it is good news for them.
 */
export function cuesFor(message: ServerMessage, team: Team | null): SoundName[] {
  if (message.type !== 'events') return [];
  const cues: SoundName[] = [];
  for (const event of message.events) {
    if (event.type === 'handStarted') cues.push('deal');
    else if (event.type === 'cardPlayed') cues.push('play');
    else if (event.type === 'trickWon') cues.push('trickWon');
    else if (event.type === 'handScored') {
      const r = event.result;
      const good = (r.biddingTeam === team) === r.made;
      cues.push(good ? 'handWon' : 'handLost');
    }
  }
  return cues;
}
