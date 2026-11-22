/** Tiny Web Audio synth so the prototype has feedback without any sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audioContext() {
  return ctx;
}

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0, slideTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number) {
  if (!ctx || !master) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + dur);
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(master);
  src.start();
}

export const sfx = {
  select: () => tone(520, 0.06, 'triangle', 0.06),
  lock: () => {
    tone(700, 0.08, 'triangle', 0.08);
    tone(1050, 0.12, 'triangle', 0.07, 0.07);
  },
  /** Landing chime; each step of a streak raises it by a whole tone. */
  land: (streak = 1) => {
    const k = Math.pow(2, (Math.min(streak - 1, 8) * 2) / 12);
    tone(660 * k, 0.16, 'sine', 0.12);
    tone(880 * k, 0.16, 'sine', 0.1, 0.1);
    tone(1320 * k, 0.3, 'sine', 0.08, 0.2);
  },
  greased: () => {
    tone(1568, 0.12, 'triangle', 0.06, 0.32);
    tone(2093, 0.25, 'triangle', 0.05, 0.42);
  },
  radio: () => {
    noise(0.08, 0.05);
    tone(1250, 0.05, 'sine', 0.03, 0.08);
  },
  buy: () => {
    tone(988, 0.08, 'triangle', 0.08);
    tone(1319, 0.08, 'triangle', 0.08, 0.07);
    tone(1976, 0.22, 'triangle', 0.07, 0.14);
  },
  mayday: () => {
    for (let i = 0; i < 3; i++) {
      tone(880, 0.12, 'square', 0.04, i * 0.3);
      tone(660, 0.12, 'square', 0.04, i * 0.3 + 0.14);
    }
  },
  warn: () => {
    tone(980, 0.07, 'square', 0.035);
    tone(980, 0.07, 'square', 0.035, 0.12);
  },
  incoming: () => tone(440, 0.12, 'sine', 0.05, 0, 620),
  taxi: () => tone(600, 0.07, 'triangle', 0.06, 0, 760),
  deny: () => {
    tone(220, 0.12, 'square', 0.04);
    tone(180, 0.16, 'square', 0.04, 0.1);
  },
  takeoff: () => {
    noise(1.1, 0.12);
    tone(180, 1.1, 'sawtooth', 0.025, 0, 420);
  },
  exit: () => {
    tone(784, 0.12, 'triangle', 0.08);
    tone(1175, 0.22, 'triangle', 0.07, 0.09);
  },
  wind: () => {
    for (let i = 0; i < 3; i++) tone(520 - i * 60, 0.18, 'sine', 0.07, i * 0.22);
  },
  levelUp: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.09, i * 0.12));
  },
  goAround: () => tone(380, 0.5, 'sine', 0.08, 0, 760),
  conflict: () => {
    tone(1320, 0.09, 'triangle', 0.07);
    tone(990, 0.09, 'triangle', 0.07, 0.11);
    tone(1320, 0.09, 'triangle', 0.07, 0.22);
  },
  coach: () => tone(880, 0.1, 'sine', 0.06, 0, 1100),
  crash: () => {
    noise(1.4, 0.9);
    tone(140, 0.8, 'sawtooth', 0.12, 0, 40);
  },
};
