/**
 * The game's sounds. Each has a recorded file (`src`) or, while that is `null`, a placeholder
 * synthesised in the browser from the recipe. To bring in real audio, put the files in
 * `src/sound/files/`, import them here and set `src`; the recipe is then unused.
 */

export type SoundName = 'deal' | 'play' | 'trickWon' | 'yourTurn' | 'handWon' | 'handLost';

/** One oscillator note. Times are seconds from the start of the sound. */
export interface Tone {
  readonly type: OscillatorType;
  readonly freq: number;
  /** Glide to this frequency by the end of the note. */
  readonly to?: number;
  readonly start: number;
  readonly dur: number;
  readonly gain: number;
}

/** A burst of filtered noise: the flick or slide of a card. */
export interface Noise {
  readonly start: number;
  readonly dur: number;
  readonly gain: number;
  /** Centre of the band-pass filter, in Hz. */
  readonly band: number;
}

export interface Recipe {
  readonly tones?: readonly Tone[];
  readonly noise?: readonly Noise[];
}

export interface SoundEntry {
  readonly src: string | null;
  readonly synth: Recipe;
  /** Loudness, 0–1, applied to the file or the recipe. */
  readonly volume: number;
}

/** A quick card flick. */
const flick = (start: number, gain = 0.5): Noise => ({ start, dur: 0.05, gain, band: 3200 });

/** Notes of a chime, `step` seconds apart. */
const chime = (freqs: readonly number[], step: number, gain: number): Tone[] =>
  freqs.map((freq, i) => ({ type: 'sine', freq, start: i * step, dur: 0.35, gain }));

export const SOUNDS: Readonly<Record<SoundName, SoundEntry>> = {
  deal: {
    src: null,
    volume: 0.5,
    synth: { noise: [0, 0.07, 0.14, 0.21, 0.28, 0.35].map((t) => flick(t, 0.4)) },
  },
  play: {
    src: null,
    volume: 0.6,
    synth: {
      noise: [{ start: 0, dur: 0.07, gain: 0.6, band: 1800 }],
      tones: [{ type: 'triangle', freq: 190, to: 120, start: 0, dur: 0.08, gain: 0.35 }],
    },
  },
  trickWon: {
    src: null,
    volume: 0.5,
    synth: {
      noise: [{ start: 0, dur: 0.18, gain: 0.35, band: 900 }],
      tones: chime([523, 784], 0.06, 0.12),
    },
  },
  yourTurn: { src: null, volume: 0.45, synth: { tones: chime([660, 880], 0.11, 0.18) } },
  handWon: { src: null, volume: 0.5, synth: { tones: chime([523, 659, 784, 1047], 0.1, 0.18) } },
  handLost: {
    src: null,
    volume: 0.5,
    synth: {
      tones: [
        { type: 'triangle', freq: 330, to: 300, start: 0, dur: 0.3, gain: 0.25 },
        { type: 'triangle', freq: 247, to: 220, start: 0.22, dur: 0.45, gain: 0.25 },
      ],
    },
  },
};
