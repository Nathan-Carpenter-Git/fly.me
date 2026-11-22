/**
 * Generative lo-fi background music, synthesized live with Web Audio.
 * Each track is a chord loop with its own tempo, voicing and groove;
 * the melody and fills are improvised so no two loops sound identical.
 *
 * To keep the audio thread light (and free of dropouts), every instrument
 * has one shared filter channel and each note is only an oscillator or two
 * plus a single envelope gain.
 */

export interface Track {
  name: string;
  bpm: number;
  /** One chord per bar, as MIDI notes. */
  chords: number[][];
  /** Bass root per bar (MIDI). */
  bass: number[];
  /** Notes the melody may pick from (MIDI). */
  scale: number[];
  drums: 'lofi' | 'soft' | 'brush';
  lead: 'rhodes' | 'pluck' | 'bell';
  melody: number;
}

export const TRACKS: Track[] = [
  {
    name: 'Tailwind',
    bpm: 74,
    chords: [
      [62, 66, 69, 73],
      [59, 62, 66, 69],
      [55, 59, 62, 66],
      [57, 61, 64, 67],
    ],
    bass: [38, 35, 31, 33],
    scale: [74, 76, 78, 81, 83, 86],
    drums: 'lofi',
    lead: 'rhodes',
    melody: 0.3,
  },
  {
    name: 'Cloud Nine',
    bpm: 82,
    chords: [
      [65, 69, 72, 76],
      [64, 67, 71, 74],
      [62, 65, 69, 72],
      [60, 64, 67, 71],
    ],
    bass: [41, 40, 38, 36],
    scale: [72, 74, 76, 79, 81, 84],
    drums: 'soft',
    lead: 'pluck',
    melody: 0.34,
  },
  {
    name: 'Night Shift',
    bpm: 68,
    chords: [
      [57, 60, 64, 67, 71],
      [53, 57, 60, 64],
      [60, 64, 67, 71],
      [55, 59, 62, 64],
    ],
    bass: [33, 29, 36, 31],
    scale: [69, 72, 74, 76, 79, 81],
    drums: 'lofi',
    lead: 'bell',
    melody: 0.24,
  },
  {
    name: 'Holding Pattern',
    bpm: 78,
    chords: [
      [63, 67, 70, 74],
      [60, 63, 67, 70],
      [56, 60, 63, 67],
      [58, 62, 65, 67],
    ],
    bass: [39, 36, 32, 34],
    scale: [75, 77, 79, 82, 84, 87],
    drums: 'brush',
    lead: 'rhodes',
    melody: 0.28,
  },
];

const BARS_PER_TRACK = 32;
const VOLUME = 0.42;

const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Shared per-instrument channels. */
export interface Bus {
  ctx: BaseAudioContext;
  pad: AudioNode;
  keys: AudioNode;
  lead: AudioNode;
  bass: AudioNode;
  kick: AudioNode;
  hat: AudioNode;
  snare: AudioNode;
  noise: AudioBuffer;
}

/** A smooth, dark reverb tail: decaying noise run through a one-pole lowpass. */
function makeImpulse(ctx: BaseAudioContext, seconds = 1.8) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += 0.18 * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - i / len, 2.5) * 2.2;
    }
  }
  return buf;
}

function makeNoise(ctx: BaseAudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Creates a filter channel feeding the dry output and the reverb send. */
function channel(
  ctx: BaseAudioContext,
  dry: AudioNode,
  wet: AudioNode,
  type: BiquadFilterType,
  freq: number,
  send: number,
  q = 0.7,
) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dry);
  if (send > 0) {
    const s = ctx.createGain();
    s.gain.value = send;
    f.connect(s).connect(wet);
  }
  return f;
}

export function makeBus(ctx: BaseAudioContext, out: AudioNode): Bus {
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  wet.connect(reverb).connect(out);
  return {
    ctx,
    pad: channel(ctx, out, wet, 'lowpass', 1100, 0.6),
    keys: channel(ctx, out, wet, 'lowpass', 1900, 0.4),
    lead: channel(ctx, out, wet, 'lowpass', 2600, 0.5),
    bass: channel(ctx, out, wet, 'lowpass', 320, 0),
    kick: channel(ctx, out, wet, 'lowpass', 180, 0),
    hat: channel(ctx, out, wet, 'bandpass', 6500, 0.15, 0.9),
    snare: channel(ctx, out, wet, 'bandpass', 1500, 0.3, 0.8),
    noise: makeNoise(ctx),
  };
}

/** One envelope gain with soft attack and smooth release, shared by a note's oscillators. */
function envelope(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain();
  // Start silent: a source can begin a fraction of a sample before the first
  // automation event, and the default gain of 1 would let a click through.
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay / 4);
  g.connect(dest);
  return g;
}

function osc(ctx: BaseAudioContext, dest: AudioNode, type: OscillatorType, freq: number, t: number, end: number, level = 1) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  if (level === 1) o.connect(dest);
  else {
    const g = ctx.createGain();
    g.gain.value = level;
    o.connect(g).connect(dest);
  }
  o.start(t);
  o.stop(end);
}

function pad(bus: Bus, t: number, notes: number[], dur: number) {
  const ctx = bus.ctx;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.022, t + 0.9);
  g.gain.setValueAtTime(0.022, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 1);
  g.connect(bus.pad);
  for (const n of notes) osc(ctx, g, 'triangle', hz(n - 12), t, t + dur + 1.05);
}

function keys(bus: Bus, track: Track, t: number, notes: number[], vel: number) {
  const ctx = bus.ctx;
  notes.forEach((n, i) => {
    const time = t + i * 0.016;
    const decay = track.lead === 'pluck' ? 1.2 : 2;
    const g = envelope(ctx, bus.keys, time, 0.03 * vel, 0.012, decay);
    osc(ctx, g, track.lead === 'pluck' ? 'triangle' : 'sine', hz(n), time, time + decay + 0.2);
  });
}

function lead(bus: Bus, track: Track, t: number, note: number, vel: number) {
  const ctx = bus.ctx;
  const f = hz(note);
  if (track.lead === 'rhodes') {
    const g = envelope(ctx, bus.lead, t, 0.06 * vel, 0.01, 1.6);
    osc(ctx, g, 'sine', f, t, t + 1.8);
    osc(ctx, g, 'sine', f * 2, t, t + 1.8, 0.12);
  } else if (track.lead === 'pluck') {
    const g = envelope(ctx, bus.lead, t, 0.06 * vel, 0.008, 0.7);
    osc(ctx, g, 'triangle', f, t, t + 0.9);
  } else {
    const g = envelope(ctx, bus.lead, t, 0.045 * vel, 0.01, 2.2);
    osc(ctx, g, 'sine', f, t, t + 2.4);
    osc(ctx, g, 'sine', f * 3, t, t + 2.4, 0.08);
  }
}

function bass(bus: Bus, t: number, note: number, dur: number) {
  const g = envelope(bus.ctx, bus.bass, t, 0.18, 0.02, dur);
  osc(bus.ctx, g, 'sine', hz(note), t, t + dur + 0.2);
  osc(bus.ctx, g, 'triangle', hz(note), t, t + dur + 0.2, 0.3);
}

function kick(bus: Bus, t: number, vel: number) {
  const ctx = bus.ctx;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = envelope(ctx, bus.kick, t, 0.3 * vel, 0.004, 0.32);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.45);
}

function noiseHit(bus: Bus, dest: AudioNode, t: number, peak: number, decay: number) {
  const src = bus.ctx.createBufferSource();
  src.buffer = bus.noise;
  const g = envelope(bus.ctx, dest, t, peak, 0.003, decay);
  src.connect(g);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.1);
}

/** Schedules everything that happens on one sixteenth-note step. */
export function playStep(bus: Bus, track: Track, step: number, t: number) {
  const beat = 60 / track.bpm;
  const six = beat / 4;
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const i = bar % track.chords.length;
  const chord = track.chords[i];
  const root = track.bass[i];
  // Lazy swing on the off-beat eighths.
  const swing = s % 4 === 2 ? six * 0.28 : 0;
  const time = t + swing;
  const r = Math.random;

  if (s === 0) {
    pad(bus, t, chord, beat * 4);
    keys(bus, track, t, chord, 1);
    bass(bus, t, root, beat * 1.6);
  }
  if (s === 8) bass(bus, t, root, beat * 1.2);
  if (s === 10 && r() < 0.5) bass(bus, time, r() < 0.5 ? root + 7 : root + 12, beat * 0.6);
  if (s === 10 && r() < 0.35) keys(bus, track, time, chord.slice(1), 0.6);

  // Improvised melody on eighth notes, quieter at the end of each phrase.
  const phraseEnd = bar % 4 === 3 && s >= 8;
  if (s % 2 === 0 && r() < track.melody * (phraseEnd ? 0.3 : 1)) {
    const note = track.scale[Math.floor(r() * track.scale.length)];
    lead(bus, track, time + r() * 0.012, note, 0.7 + r() * 0.3);
  }

  if (track.drums === 'lofi') {
    if (s === 0 || s === 10 || (s === 7 && r() < 0.4)) kick(bus, t, s === 0 ? 1 : 0.75);
    if (s === 4 || s === 12) noiseHit(bus, bus.snare, t, 0.09, 0.14);
    if (s % 2 === 0) noiseHit(bus, bus.hat, time, 0.012 + r() * 0.008, 0.04);
  } else if (track.drums === 'soft') {
    if (s === 0 || s === 8) kick(bus, t, 0.7);
    if (s === 12) noiseHit(bus, bus.snare, t, 0.05, 0.08);
    if (s % 2 === 0) noiseHit(bus, bus.hat, time, 0.01 + r() * 0.006, 0.05);
  } else {
    if (s === 0) kick(bus, t, 0.6);
    if (s === 4 || s === 12) noiseHit(bus, bus.snare, t, 0.035, 0.25);
    if (s % 2 === 0) noiseHit(bus, bus.hat, time, 0.006 + r() * 0.004, 0.08);
  }
}

export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private bus: Bus | null = null;
  private timer: number | null = null;
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private enabled: boolean;

  constructor(
    private getContext: () => AudioContext | null,
    enabled: boolean,
    private onTrack: (name: string) => void,
  ) {
    this.enabled = enabled;
  }

  get isEnabled() {
    return this.enabled;
  }

  /** Starts playback if enabled and the audio context is unlocked. Safe to call repeatedly. */
  start() {
    if (!this.enabled || this.timer !== null) return;
    const ctx = this.getContext();
    if (!ctx) return;
    if (!this.ctx) {
      this.ctx = ctx;
      // A gentle high cut keeps the mix warm and soft under the sound effects.
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 7000;
      tone.Q.value = 0.5;
      tone.connect(ctx.destination);
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(tone);
      this.bus = makeBus(ctx, this.out);
    }
    this.begin(this.pickTrack(), ctx.currentTime + 0.15);
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && this.out) {
      const now = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(this.out.gain.value, now);
      this.out.gain.linearRampToValueAtTime(0, now + 0.6);
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.start();
    else this.stop();
  }

  private pickTrack() {
    const others = TRACKS.filter((t) => t !== this.track);
    return others[Math.floor(Math.random() * others.length)];
  }

  private begin(track: Track, at: number) {
    this.track = track;
    this.step = 0;
    this.nextTime = at;
    const g = this.out!.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(VOLUME, at + 2.5);
    this.onTrack(track.name);
  }

  private tick() {
    const ctx = this.ctx!;
    const track = this.track!;
    const six = 60 / track.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.2) {
      if (this.step === (BARS_PER_TRACK - 1) * 16) {
        // Fade out across the final bar, then move on to a different track.
        const g = this.out!.gain;
        g.setValueAtTime(VOLUME, this.nextTime);
        g.linearRampToValueAtTime(0, this.nextTime + six * 16);
      }
      if (this.step >= BARS_PER_TRACK * 16) {
        this.begin(this.pickTrack(), this.nextTime + 1.5);
        return;
      }
      playStep(this.bus!, track, this.step, this.nextTime);
      this.nextTime += six;
      this.step++;
    }
  }
}
