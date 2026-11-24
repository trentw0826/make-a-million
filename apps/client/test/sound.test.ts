import type { GameEvent, HandResult } from '@mam/engine';
import type { ServerMessage } from '@mam/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUNDS, type SoundName } from '../src/sound/manifest';
import { storage } from '../src/storage';

const events = (...list: GameEvent[]): ServerMessage => ({ type: 'events', events: list });

const scored = (biddingTeam: 0 | 1, made: boolean): GameEvent => ({
  type: 'handScored',
  result: { biddingTeam, made } as unknown as HandResult,
});

/** Just enough of Web Audio to count the notes a sound starts. */
class FakeAudioContext {
  static started = 0;
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  private node() {
    const param = {
      value: 0,
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    };
    const node = {
      gain: param,
      frequency: { ...param },
      Q: { ...param },
      type: '',
      buffer: null,
      connect: (next: unknown) => next,
      start: () => {
        FakeAudioContext.started++;
      },
      stop: () => {},
    };
    return node;
  }
  createGain() {
    return this.node();
  }
  createOscillator() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createBuffer(_channels: number, length: number) {
    return { sampleRate: this.sampleRate, getChannelData: () => new Float32Array(length) };
  }
  resume() {
    return Promise.resolve();
  }
}

describe('sound cues', () => {
  it('maps the deal, plays and taken tricks to their sounds', async () => {
    const { cuesFor } = await import('../src/sound/player');
    const message = events(
      { type: 'cardPlayed', seat: 0, cardId: 3 },
      { type: 'trickWon', seat: 0, trickIndex: 0 },
    );
    expect(cuesFor(message, 0)).toEqual(['play', 'trickWon']);
    expect(cuesFor({ type: 'pong' } as ServerMessage, 0)).toEqual([]);
  });

  it('ends a hand on good news when it is good for the viewer', async () => {
    const { cuesFor } = await import('../src/sound/player');
    expect(cuesFor(events(scored(0, true)), 0)).toEqual(['handWon']);
    expect(cuesFor(events(scored(0, false)), 0)).toEqual(['handLost']);
    // The other side was set: good news for us.
    expect(cuesFor(events(scored(1, false)), 0)).toEqual(['handWon']);
    expect(cuesFor(events(scored(1, true)), 0)).toEqual(['handLost']);
  });

  it('has a sound, file or placeholder, for every cue', () => {
    const names: SoundName[] = [
      'deal',
      'play',
      'trickWon',
      'yourTurn',
      'handWon',
      'handLost',
      'gameWon',
    ];
    for (const name of names) {
      const entry = SOUNDS[name];
      expect(
        entry.src !== null ||
          (entry.synth.tones?.length ?? 0) + (entry.synth.noise?.length ?? 0) > 0,
      ).toBe(true);
    }
  });
});

describe('sound player', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeAudioContext.started = 0;
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing where there is no Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { sound } = await import('../src/sound/player');
    expect(() => sound.play('play')).not.toThrow();
  });

  it('synthesises the placeholder, and stays quiet while muted', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { sound } = await import('../src/sound/player');
    sound.play('yourTurn');
    expect(FakeAudioContext.started).toBe(SOUNDS.yourTurn.synth.tones?.length);

    FakeAudioContext.started = 0;
    sound.setMuted(true);
    sound.play('yourTurn');
    expect(FakeAudioContext.started).toBe(0);
    expect(storage.muted()).toBe(true);
  });

  it('starts muted when the player muted it last time', async () => {
    storage.setMuted(true);
    const { sound } = await import('../src/sound/player');
    expect(sound.isMuted).toBe(true);
  });
});
