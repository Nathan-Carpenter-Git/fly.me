import Phaser from 'phaser';
import {
  W,
  H,
  ZOOM,
  KINDS,
  Kind,
  Dest,
  FAST_MULT,
  TAXI_SPEED,
  HEAVY_TURN_RADIUS,
  FONT,
  GREEN,
  GREEN_CSS,
  FARES,
  EMERGENCY_BONUS,
  STREAK_WINDOW,
  money,
} from './config';
import { Airport, Gate, Point, Runway, Stand } from './airport';
import {
  ARRIVALS_END,
  Career,
  DAY_SECONDS,
  DEPARTURES_END,
  DayDef,
  FEATURE_DAYS,
  ItemId,
  RUSH_END,
  RUSH_START,
  clearCareer,
  clock,
  dayDef,
  demand,
  effects,
  homeLayout,
  hourAt,
  itemById,
  layoutKey,
  loadCareer,
  newCareer,
  saveCareer,
} from './career';
import { BuildMenu } from './buildMenu';
import { createBackground, createTextures, TEX_SCALE } from './textures';
import { Coach, CoachMsg } from './coach';
import { sfx, unlockAudio, audioContext } from './audio';
import { Music } from './music';
import { Director } from './director';

type State = 'flying' | 'final' | 'vacate' | 'parked' | 'taxi' | 'hold' | 'lineup' | 'takeoff' | 'gone';

type Target = { type: 'runway'; rw: Runway } | { type: 'pad'; pad: Point } | { type: 'gate'; gate: Gate };

interface Aircraft {
  id: number;
  kind: Kind;
  fast: boolean;
  x: number;
  y: number;
  heading: number;
  speed: number;
  /** Current ground or roll speed. */
  v: number;
  state: State;
  /** 1 = cruising altitude, 0 = on the ground. */
  alt: number;
  entered: boolean;
  warn: boolean;
  path: Point[];
  target: Target | null;
  gate: Gate | null;
  rw: Runway | null;
  end: 0 | 1;
  along: number;
  lateral: number;
  onRunway: boolean;
  route: Point[];
  stand: Stand | null;
  fading: boolean;
  alpha: number;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  rotor?: Phaser.GameObjects.Image;
  rotorShadow?: Phaser.GameObjects.Image;
  tag?: Phaser.GameObjects.Text;
  /** Smoothed bank angle, -1..1, drives the wing foreshortening. */
  bank: number;
  /** Random offset so blinking lights are not in sync. */
  phase: number;
  trail: { x: number; y: number; h: number }[];
  trailT: number;
  callsign: string;
  label: Phaser.GameObjects.Text;
  /** Seconds of fuel left during an emergency; fuelMax is 0 for normal flights. */
  fuel: number;
  fuelMax: number;
  /** How cleanly the final approach lined up with the runway. */
  grade: 'greased' | 'smooth' | null;
  /** Recent positions, used to judge the approach. */
  hist: Point[];
  /** A helicopter hovering short of a busy helipad. */
  holding: boolean;
  /** Seconds a departure has been parked, for the ground crew upgrade. */
  wait: number;
}

interface Conflict {
  a: Aircraft;
  b: Aircraft;
  x: number;
  y: number;
}

type Mode = 'title' | 'intro' | 'play' | 'summary' | 'build' | 'fired';

interface Marker {
  icon: string;
  label: string;
  rotate?: boolean;
  rotor?: boolean;
  tag?: string;
  tagColor?: string;
  isNew?: boolean;
}

interface CardOpts {
  kicker: string;
  title: string;
  prompt: string;
  markers?: Marker[];
  stats?: [string, string][];
  keys?: [string, string][];
}

const WARN_GAP = 36;
const PICK_RADIUS = 40;
const GROUND_PICK = 22;
const PATH_STEP = 9;
const EDGE = 14;
const BEST_KEY = 'flyme.best';
const SEEN_KEY = 'flyme.tutorials';
interface Button {
  rect: { x: number; y: number; w: number; h: number };
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
}
const MUSIC_KEY = 'flyme.music';
const FAST_FORWARD = 3;
const RADIO_LINES = 3;
const AIRLINES = ['FLY', 'SKY', 'NOVA', 'ORCA', 'JET', 'AERO', 'LARK', 'PIKE'];
const HELI_CALLS = ['HELI', 'MEDIC', 'RANGER'];
const AMBER = 0xffb020;
/** How far ahead collision prediction looks, and its time step, in seconds. */
const PREDICT_STEP = 0.25;
/** Wingtip light positions in texture space (x along the fuselage, y along the wing). */
const WINGTIPS: Partial<Record<Kind, [number, number]>> = {
  jet: [-8, 23],
  depart: [-8, 23],
  heavy: [-13, 32],
  prop: [0, 21],
  transit: [-7, 19],
};
/** Engine offsets used for contrails. */
const ENGINES: Partial<Record<Kind, [number, number]>> = {
  jet: [-4, 12],
  depart: [-4, 12],
  heavy: [-6, 19],
  transit: [-14, 5],
};

const Angle = Phaser.Math.Angle;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const isOutbound = (k: Kind) => KINDS[k].dest === 'gate';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); progress just won't persist.
  }
}

export class GameScene extends Phaser.Scene {
  private planes: Aircraft[] = [];
  private airport!: Airport;
  private day!: DayDef;
  private career: Career = newCareer();
  private built = new Set<ItemId>();
  private fx2 = effects(new Set());
  private buildMenu!: BuildMenu;
  private rushAnnounced = false;
  private dayStats = { earned: 0, landed: 0, departed: 0, greased: 0 };
  private mode: Mode = 'title';
  private paused = false;
  private coach!: Coach;
  private seen = new Set<string>();

  private dragging: Aircraft | null = null;
  private hover: Aircraft | null = null;
  private score = 0;
  private best = 0;
  private departSpawned = 0;
  private elapsed = 0;
  private spawnIn = 0;
  private departIn = 0;
  private windIn = 0;
  private windWarned = false;
  private time0 = 0;
  private lastWarnSfx = 0;
  private lastConflictSfx = 0;
  private conflicts: Conflict[] = [];
  private conflictKeys = new Set<string>();
  private nextId = 1;
  private music!: Music;

  private bg!: Phaser.GameObjects.Image;
  private bgKey = '';
  private fx!: Phaser.GameObjects.Graphics;
  private navLights!: Phaser.GameObjects.Graphics;
  private skipBtn!: Button;
  private musicBtn!: Button;
  private dayPanel!: Phaser.GameObjects.Graphics;
  private director = new Director();
  private speedBtn!: Button;
  private speedMul = 1;
  private streak = 0;
  private streakLeft = 0;
  private streakG!: Phaser.GameObjects.Graphics;
  private streakText!: Phaser.GameObjects.Text;
  private statPanel!: Phaser.GameObjects.Graphics;
  private scoreLabel!: Phaser.GameObjects.Text;
  private bestLabel!: Phaser.GameObjects.Text;
  private radioLines: Phaser.GameObjects.Text[] = [];
  private lastRadioSfx = 0;
  private trackText!: Phaser.GameObjects.Text;
  private clouds: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private pauseText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private legend: Phaser.GameObjects.GameObject[] = [];
  private gateLabels: Phaser.GameObjects.Text[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('game');
  }

  create() {
    createTextures(this);
    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.centerOn(W / 2, H / 2);

    this.bg = this.add.image(0, 0, '__WHITE').setOrigin(0).setDepth(0);
    this.fx = this.add.graphics().setDepth(12);
    this.navLights = this.add.graphics().setDepth(24);
    for (let i = 0; i < 5; i++) {
      this.clouds.push(
        this.add
          .image(Math.random() * W, 80 + Math.random() * (H - 160), `cloud${i % 3}`)
          .setScale((0.9 + Math.random() * 0.8) / TEX_SCALE)
          .setAlpha(0.22)
          .setDepth(30),
      );
    }

    this.best = Number(load(BEST_KEY, 0)) || 0;
    // Career bests replaced per-run scores; keep the key but read it as dollars.
    this.seen = new Set(load<string[]>(SEEN_KEY, []));
    this.coach = new Coach(this);
    this.music = new Music(audioContext, load(MUSIC_KEY, true), (name) => this.showTrack(name));
    this.buildHud();
    this.bindInput();
    this.buildMenu = new BuildMenu(
      this,
      (x, y, str, size, color, weight) => this.text(x, y, str, size, color, weight),
      (id) => this.buy(id),
      () => this.finishBuilding(),
    );
    this.career = loadCareer() ?? newCareer();
    this.setScore(this.career.cash);
    this.loadDay();
    this.showTitle();

    if (import.meta.env.DEV) (window as unknown as { __scene: GameScene }).__scene = this;
  }

  // ---------------------------------------------------------------- HUD

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', weight = 700) {
    return this.add
      .text(x, y, s, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: String(weight),
        color,
        resolution: ZOOM * 2,
      })
      .setDepth(100);
  }

  private buildHud() {
    this.statPanel = this.add.graphics().setDepth(99);

    this.scoreLabel = this.text(30, 22, 'CASH', 12, '#a9c4b4').setLetterSpacing(2);
    this.scoreText = this.text(30, 36, money(0), 28, '#ffffff', 800);
    this.bestLabel = this.text(0, 22, 'BEST CAREER', 12, '#a9c4b4').setLetterSpacing(2);
    this.bestText = this.text(0, 36, money(this.best), 28, '#ffffff', 800);
    this.layoutStatPanels();
    this.streakG = this.add.graphics().setDepth(99);
    this.streakText = this.text(30, 93, '', 13, '#ffc93c', 800).setOrigin(0, 0.5).setLetterSpacing(1);

    this.dayPanel = this.add.graphics().setDepth(99);
    this.dayText = this.text(W / 2, 22, '', 12, '#a9c4b4').setOrigin(0.5, 0).setLetterSpacing(2);
    this.progressText = this.text(W / 2, 38, '', 15, '#ffffff', 700).setOrigin(0.5, 0);
    this.progressBar = this.add.graphics().setDepth(100);

    this.skipBtn = this.makeButton(80, 'End day  ·  N');
    this.musicBtn = this.makeButton(112, '');
    this.updateMusicLabel();
    this.speedBtn = this.makeButton(144, '');
    this.setSpeed(1);
    this.trackText = this.text(W - 24, H - 30, '', 13, '#cfe0d6', 500)
      .setOrigin(1, 0.5)
      .setStroke('#0b1410', 4)
      .setAlpha(0);

    this.pauseText = this.text(W / 2, 96, 'Paused  ·  P to resume', 16)
      .setOrigin(0.5, 0)
      .setStroke('#0b1410', 5)
      .setVisible(false);
    this.banner = this.text(W / 2, 96, '', 20, '#ffffff', 800)
      .setOrigin(0.5, 0)
      .setStroke('#0b1410', 6)
      .setAlpha(0);
  }

  private makeButton(y: number, label: string): Button {
    const b: Button = {
      rect: { x: 0, y, w: 0, h: 26 },
      bg: this.add.graphics().setDepth(100),
      text: this.text(0, y + 13, '', 12, '#cfe0d6').setOrigin(0.5).setLetterSpacing(1),
    };
    this.setButtonLabel(b, label);
    return b;
  }

  /** Buttons are right-aligned under the BEST panel and grow to fit their label. */
  private setButtonLabel(b: Button, label: string) {
    b.text.setText(label);
    const w = Math.max(120, Math.ceil(b.text.width) + 24);
    b.rect = { x: W - 16 - w, y: b.rect.y, w, h: 26 };
    b.text.setPosition(b.rect.x + w / 2, b.rect.y + 13);
    b.bg.clear();
    b.bg.fillStyle(0x0b1410, 0.6);
    b.bg.fillRoundedRect(b.rect.x, b.rect.y, w, 26, 8);
    b.bg.lineStyle(1, 0xffffff, 0.15);
    b.bg.strokeRoundedRect(b.rect.x, b.rect.y, w, 26, 8);
  }

  private hit(b: Button, x: number, y: number) {
    const r = b.rect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private buildLegend() {
    for (const o of this.legend) o.destroy();
    this.legend = [];
    const mix = this.day.mix;
    const kinds: Kind[] = (['jet', 'heavy', 'prop', 'heli', 'transit'] as Kind[]).filter((k) => mix[k]);
    if (this.day.features.has('depart') && !kinds.includes('transit')) kinds.push('depart');
    const items: [Kind, string][] = kinds.map((k) => [k, KINDS[k].legend]);

    const bg = this.add.graphics().setDepth(99);
    this.legend.push(bg);
    let x = 30;
    for (const [kind, label] of items) {
      const icon = this.add
        .image(x + 10, H - 30, `ac-${kind}`)
        .setScale((kind === 'heavy' ? 0.45 : 0.55) / TEX_SCALE)
        .setRotation(-Math.PI / 2)
        .setDepth(100);
      this.legend.push(icon);
      if (kind === 'heli') {
        this.legend.push(this.add.image(icon.x, icon.y, 'rotor').setScale(0.55 / TEX_SCALE).setDepth(100));
      }
      const t = this.text(x + 26, H - 39, label, 14, KINDS[kind].css);
      this.legend.push(t);
      x += 26 + t.width + 22;
    }
    bg.fillStyle(0x0b1410, 0.6);
    bg.fillRoundedRect(16, H - 46, x - 16 + 4, 32, 10);
  }

  /** Money panels size to their values so large amounts never overflow. */
  private layoutStatPanels() {
    const g = this.statPanel;
    g.clear();
    g.fillStyle(0x0b1410, 0.6);
    const leftW = Math.max(150, Math.ceil(Math.max(this.scoreText.width, this.scoreLabel.width)) + 28);
    g.fillRoundedRect(16, 14, leftW, 58, 12);
    const rightW = Math.max(120, Math.ceil(Math.max(this.bestText.width, this.bestLabel.width)) + 28);
    g.fillRoundedRect(W - 16 - rightW, 14, rightW, 58, 12);
    this.bestLabel.setX(W - 16 - rightW + 14);
    this.bestText.setX(W - 16 - rightW + 14);
  }

  private setSpeed(mul: number) {
    this.speedMul = mul;
    this.setButtonLabel(this.speedBtn, mul > 1 ? `Speed ${mul}x  ·  F` : 'Speed 1x  ·  F');
    this.speedBtn.text.setColor(mul > 1 ? '#ffc93c' : '#cfe0d6');
  }

  /** Drops back to normal speed when something needs the player's attention. */
  private slowDown() {
    if (this.speedMul > 1) this.setSpeed(1);
  }

  private drawStreak() {
    const g = this.streakG;
    g.clear();
    if (this.streak < 2 || this.mode !== 'play') {
      this.streakText.setVisible(false);
      return;
    }
    this.streakText.setVisible(true).setText(`STREAK  x${this.multiplier().toFixed(2).replace(/\.?0+$/, '')}`);
    const w = Math.max(150, Math.ceil(this.streakText.width) + 28);
    g.fillStyle(0x0b1410, 0.6);
    g.fillRoundedRect(16, 80, w, 30, 10);
    g.fillStyle(0xffc93c, 0.85);
    g.fillRoundedRect(28, 104, (w - 24) * (this.streakLeft / STREAK_WINDOW), 3, 1.5);
  }

  private multiplier() {
    return Math.min(3, 1 + 0.25 * Math.max(0, this.streak - 1));
  }

  // ---------------------------------------------------------------- radio

  private radio(msg: string) {
    if (this.mode !== 'play') return;
    for (const line of this.radioLines) line.y -= 19;
    const line = this.text(W - 24, H - 56, msg, 13, '#e8f0ea', 500).setOrigin(1, 0.5).setStroke('#0b1410', 4);
    this.radioLines.push(line);
    while (this.radioLines.length > RADIO_LINES) this.radioLines.shift()!.destroy();
    this.tweens.add({
      targets: line,
      alpha: 0,
      delay: 5000,
      duration: 800,
      onComplete: () => {
        this.radioLines = this.radioLines.filter((l) => l !== line);
        line.destroy();
      },
    });
    if (this.time.now - this.lastRadioSfx > 350) {
      this.lastRadioSfx = this.time.now;
      sfx.radio();
    }
  }

  private clearRadio() {
    for (const l of this.radioLines) l.destroy();
    this.radioLines = [];
  }

  private makeCallsign(kind: Kind) {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    for (let i = 0; i < 20; i++) {
      let cs: string;
      if (kind === 'prop') cs = `N${10 + Math.floor(Math.random() * 990)}${pick(['K', 'M', 'T', 'X', 'Z'])}`;
      else if (kind === 'heli') cs = `${pick(HELI_CALLS)} ${1 + Math.floor(Math.random() * 30)}`;
      else cs = `${pick(AIRLINES)} ${10 + Math.floor(Math.random() * 890)}`;
      if (!this.planes.some((a) => a.callsign === cs)) return cs;
    }
    return `FLY ${Math.floor(Math.random() * 9000) + 1000}`;
  }

  private updateMusicLabel() {
    this.setButtonLabel(this.musicBtn, `Music ${this.music.isEnabled ? 'on' : 'off'}  ·  M`);
  }

  private toggleMusic() {
    unlockAudio();
    this.music.setEnabled(!this.music.isEnabled);
    save(MUSIC_KEY, this.music.isEnabled);
    this.updateMusicLabel();
  }

  private showTrack(name: string) {
    this.tweens.killTweensOf(this.trackText);
    this.trackText.setText(`♪  ${name}`).setAlpha(0);
    this.tweens.add({ targets: this.trackText, alpha: 0.85, duration: 600, delay: 1500 });
    this.tweens.add({ targets: this.trackText, alpha: 0, duration: 1200, delay: 6500 });
  }

  /** Day panel: day number, clock, and a timeline with the rush hour band. */
  private updateProgress() {
    this.dayText.setText(`DAY ${this.career.day}  ·  ${this.airport.def.name.toUpperCase()}`);
    const hour = hourAt(this.elapsed);
    const rush = hour >= RUSH_START && hour < RUSH_END;
    this.progressText.setText(rush ? `${clock(hour)}   RUSH HOUR` : clock(hour)).setColor(rush ? '#ffc93c' : '#ffffff');
    const panelW = Math.max(380, Math.ceil(Math.max(this.dayText.width, this.progressText.width)) + 48);
    this.dayPanel.clear();
    this.dayPanel.fillStyle(0x0b1410, 0.6);
    this.dayPanel.fillRoundedRect(W / 2 - panelW / 2, 14, panelW, 58, 12);
    const barW = panelW - 40;
    const x0 = W / 2 - barW / 2;
    const at = (h: number) => x0 + (barW * (h - 6)) / 16;
    const g = this.progressBar;
    g.clear();
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(x0, 62, barW, 4, 2);
    g.fillStyle(0xffc93c, 0.35);
    g.fillRect(at(RUSH_START), 62, at(RUSH_END) - at(RUSH_START), 4);
    g.fillStyle(GREEN, 0.9);
    if (hour > 6) g.fillRoundedRect(x0, 62, at(hour) - x0, 4, 2);
  }

  private setScore(v: number) {
    this.score = v;
    this.scoreText.setText(money(v));
    this.layoutStatPanels();
  }

  private showBanner(msg: string, color = '#ffffff', hold = 1800) {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(msg).setColor(color).setAlpha(1).setScale(1.15);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 250, ease: 'Back.Out' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: hold, duration: 400 });
  }

  private popText(x: number, y: number, s: string, color: string) {
    const pop = this.text(x, y - 18, s, 18, color, 800).setOrigin(0.5).setStroke('#0b1410', 4);
    this.tweens.add({
      targets: pop,
      y: y - 46,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.Out',
      onComplete: () => pop.destroy(),
    });
  }

  // ---------------------------------------------------------------- overlay cards

  private showCard(opts: CardOpts) {
    this.overlay?.destroy();
    const pad = 36;
    const content: Phaser.GameObjects.GameObject[] = [];

    // Build everything first, then size the card to whatever is widest, so no text can overflow.
    const chips = (opts.markers ?? []).map((m) => this.buildMarker(m));
    const chipGap = 10;
    const chipW = Math.max(262, ...chips.map((c) => c.minW));
    const maxInner = W - 80 - pad * 2;
    const cols = chips.length > 1 && chipW * 2 + chipGap <= maxInner ? 2 : 1;

    const stats = (opts.stats ?? []).map(([label, value]) => {
      const l = this.text(0, 0, label, 11, '#a9c4b4').setOrigin(0.5, 0).setLetterSpacing(2);
      const v = this.text(0, 0, value, 24, '#ffffff', 800).setOrigin(0.5, 0);
      return { l, v, w: Math.max(140, Math.ceil(Math.max(l.width, v.width)) + 28) };
    });
    const statGap = 12;
    const statsW = stats.reduce((s, x) => s + x.w, 0) + statGap * Math.max(0, stats.length - 1);

    const keys = (opts.keys ?? []).map(([key, label]) => {
      const k = this.text(0, 0, key, 13, '#ffffff', 800).setOrigin(0.5);
      const l = this.text(0, 0, label, 14, '#cfe0d6', 500).setOrigin(0, 0.5);
      const capW = Math.max(28, Math.ceil(k.width) + 16);
      return { k, l, capW, w: capW + 8 + Math.ceil(l.width) };
    });
    const keyGap = 26;
    const keysW = keys.reduce((s, x) => s + x.w, 0) + keyGap * Math.max(0, keys.length - 1);

    const kicker = opts.kicker ? this.text(0, 0, opts.kicker, 13, '#ffc93c').setOrigin(0.5, 0).setLetterSpacing(3) : null;
    const title = this.text(0, 0, opts.title, 46, '#ffffff', 800).setOrigin(0.5, 0);
    const prompt = this.text(0, 0, opts.prompt, 19, '#ffc93c').setOrigin(0.5, 0);

    const gridW = chips.length ? cols * chipW + (cols - 1) * chipGap : 0;
    const cardW = Math.min(
      W - 80,
      Math.max(600, gridW, statsW, keysW, title.width, kicker?.width ?? 0, prompt.width) + (chips.length ? pad * 2 : 0),
    );
    const mid = cardW / 2;

    let y = 34;
    if (kicker) {
      content.push(kicker.setPosition(mid, y));
      y += 24;
    }
    content.push(title.setPosition(mid, y));
    y += title.height + 20;

    if (chips.length) {
      const x0 = (cardW - gridW) / 2;
      chips.forEach((c, i) => {
        const lastAlone = cols === 2 && i === chips.length - 1 && i % 2 === 0;
        const x = lastAlone ? (cardW - chipW) / 2 : x0 + (i % cols) * (chipW + chipGap);
        const cy = y + Math.floor(i / cols) * (42 + chipGap);
        content.push(...c.place(x, cy, chipW, 42));
      });
      y += Math.ceil(chips.length / cols) * (42 + chipGap) + 12;
    }

    if (stats.length) {
      let x = (cardW - statsW) / 2;
      for (const st of stats) {
        const bg = this.add.graphics();
        bg.fillStyle(0xffffff, 0.05);
        bg.fillRoundedRect(x, y, st.w, 58, 10);
        content.push(bg, st.l.setPosition(x + st.w / 2, y + 9), st.v.setPosition(x + st.w / 2, y + 25));
        x += st.w + statGap;
      }
      y += 58 + 26;
    }

    if (keys.length) {
      let x = (cardW - keysW) / 2;
      for (const p of keys) {
        const cap = this.add.graphics();
        cap.fillStyle(0xffffff, 0.1);
        cap.fillRoundedRect(x, y, p.capW, 28, 6);
        cap.lineStyle(1, 0xffffff, 0.25);
        cap.strokeRoundedRect(x, y, p.capW, 28, 6);
        content.push(cap, p.k.setPosition(x + p.capW / 2, y + 14), p.l.setPosition(x + p.capW + 8, y + 14));
        x += p.w + keyGap;
      }
      y += 28 + 28;
    }

    content.push(prompt.setPosition(mid, y));
    y += prompt.height + 34;
    const cardH = y;
    const card = this.add.graphics();
    card.fillStyle(0x0f1d16, 0.94);
    card.fillRoundedRect(0, 0, cardW, cardH, 22);
    card.lineStyle(2, 0xffffff, 0.08);
    card.strokeRoundedRect(0, 0, cardW, cardH, 22);
    const shade = this.add.rectangle(0, 0, W, H, 0x06100b, 0.62).setOrigin(0);
    const inner = this.add.container(Math.round(W / 2 - cardW / 2), Math.round(H / 2 - cardH / 2), [card, ...content]);
    this.overlay = this.add.container(0, 0, [shade, inner]).setDepth(200).setAlpha(0);
    this.tweens.add({ targets: this.overlay, alpha: 1, duration: 220 });
    this.tweens.add({ targets: prompt, alpha: 0.35, yoyo: true, repeat: -1, duration: 700 });
  }

  /**
   * One row in a level card: icon, name, NEW badge and destination tag. Returns the
   * minimum width that fits all of it, and a function that lays it out at a given size.
   */
  private buildMarker(m: Marker) {
    const bg = this.add.graphics();
    const icon = this.add.image(0, 0, m.icon);
    icon.setScale(30 / Math.max(icon.width, icon.height));
    if (m.rotate) icon.setRotation(-Math.PI / 2);
    const rotor = m.rotor ? this.add.image(0, 0, 'rotor').setScale(icon.scale) : null;
    const label = this.text(0, 0, m.label, 15, '#ffffff', 700).setOrigin(0, 0.5);
    const badge = m.isNew
      ? this.text(0, 0, 'NEW', 10, '#0b1410', 800)
          .setOrigin(0, 0.5)
          .setBackgroundColor('#ffc93c')
          .setPadding(5, 2, 5, 2)
          .setLetterSpacing(1)
      : null;
    const tag = m.tag
      ? this.text(0, 0, m.tag.toUpperCase(), 10, '#0b1410', 800)
          .setOrigin(1, 0.5)
          .setBackgroundColor(m.tagColor ?? '#cfe0d6')
          .setPadding(6, 3, 6, 3)
          .setLetterSpacing(1)
      : null;
    const left = 46;
    const minW = Math.ceil(
      left + label.width + (badge ? 8 + badge.width : 0) + (tag ? 14 + tag.width : 0) + 12,
    );
    const place = (x: number, y: number, w: number, h: number) => {
      bg.fillStyle(0xffffff, m.isNew ? 0.1 : 0.05);
      bg.fillRoundedRect(x, y, w, h, 10);
      if (m.isNew) {
        bg.lineStyle(1.5, 0xffc93c, 0.8);
        bg.strokeRoundedRect(x, y, w, h, 10);
      }
      icon.setPosition(x + 24, y + h / 2);
      rotor?.setPosition(icon.x, icon.y);
      label.setPosition(x + left, y + h / 2);
      badge?.setPosition(label.x + label.width + 8, y + h / 2);
      tag?.setPosition(x + w - 10, y + h / 2);
      return [bg, icon, rotor, label, badge, tag].filter((o): o is NonNullable<typeof o> => o !== null);
    };
    return { minW, place };
  }

  /** What today brings: traffic types, conditions, and anything new since yesterday. */
  private dayMarkers(): Marker[] {
    const d = this.day;
    const fresh = new Set(this.career.fresh);
    const unlocks: Partial<Record<Kind, ItemId>> = { jet: 'long', heli: 'pad1', heavy: 'extend', transit: 'contract' };
    const plane = (kind: Kind, label: string): Marker => ({
      icon: `ac-${kind}`,
      rotate: true,
      rotor: kind === 'heli',
      label,
      tag: { long: 'Long runway', short: 'Short runway', pad: 'Helipad', gate: 'Exit gate' }[KINDS[kind].dest],
      tagColor: KINDS[kind].css,
      isNew: unlocks[kind] ? fresh.has(unlocks[kind]!) : false,
    });
    const list: Marker[] = [];
    if (d.mix.jet) list.push(plane('jet', 'Jets'));
    if (d.mix.heavy) list.push(plane('heavy', 'Heavy jets'));
    if (d.mix.prop) list.push(plane('prop', 'Props'));
    if (d.mix.heli) list.push(plane('heli', 'Helicopters'));
    list.push(plane('depart', 'Departures'));
    if (d.mix.transit) list.push(plane('transit', 'Overflights'));
    const isNew = (f: 'fast' | 'wind' | 'fuel') => FEATURE_DAYS[f] === d.day;
    if (d.features.has('fast')) list.push({ icon: 'icon-fast', rotate: true, label: 'Fast planes', isNew: isNew('fast') });
    if (d.features.has('wind')) list.push({ icon: 'icon-wind', label: 'Wind shifts', isNew: isNew('wind') });
    if (d.features.has('fuel')) list.push({ icon: 'icon-fuel', label: 'Fuel emergencies', isNew: isNew('fuel') });
    // Purchases that do not unlock a traffic type still get a NEW chip so the player sees them land.
    const traffic = new Set(Object.values(unlocks));
    for (const id of this.career.fresh) {
      if (traffic.has(id)) continue;
      const item = itemById(id);
      list.push({ icon: item.icon, rotate: item.rotate, label: item.name, tag: item.effect, isNew: true });
    }
    return list.sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
  }

  private hideCard() {
    const o = this.overlay;
    if (!o) return;
    this.overlay = null;
    this.tweens.add({ targets: o, alpha: 0, duration: 180, onComplete: () => o.destroy() });
  }

  private showTitle() {
    this.mode = 'title';
    const saved = loadCareer();
    this.showCard({
      kicker: saved ? `DAY ${saved.day}  ·  ${money(saved.cash)}` : '',
      title: 'fly.me',
      keys: [
        ['P', 'Pause'],
        ['F', 'Speed'],
        ['M', 'Music'],
        ['R', 'Reset tips'],
      ],
      prompt: saved ? 'Click to continue' : 'Click to play',
    });
  }

  private showDayIntro() {
    this.loadDay();
    this.mode = 'intro';
    this.showCard({
      kicker: `DAY ${this.career.day}`,
      title: this.airport.def.name,
      markers: this.dayMarkers(),
      stats: [
        ['CASH', money(this.career.cash)],
        ['RUSH HOUR', `${clock(RUSH_START)} to ${clock(RUSH_END)}`],
      ],
      prompt: 'Click to start the day',
    });
  }

  // ---------------------------------------------------------------- day flow

  /** Builds the airport for the current career and resets everything for a fresh day. */
  private loadDay() {
    for (const a of this.planes) this.destroyPlane(a);
    this.planes = [];
    this.coach.clear();
    this.built = new Set(this.career.built);
    this.day = dayDef(this.career.day, this.built);
    this.fx2 = effects(this.built);
    this.applyLayout();

    this.dayStats = { earned: 0, landed: 0, departed: 0, greased: 0 };
    this.departSpawned = 0;
    this.elapsed = 0;
    this.spawnIn = 1.5;
    this.departIn = this.career.day === 1 ? 14 : 6;
    this.windIn = rand(this.day.windEvery);
    this.windWarned = false;
    this.rushAnnounced = false;
    this.paused = false;
    this.dragging = null;
    this.hover = null;
    this.pauseText.setVisible(false);
    this.director.reset();
    this.streak = 0;
    this.streakLeft = 0;
    this.clearRadio();
    this.setSpeed(1);
    this.buildLegend();
    this.updateProgress();
  }

  /** Rebuilds the airport geometry and map art from the current set of facilities. */
  private applyLayout() {
    this.airport = new Airport(homeLayout(this.built));
    const key = layoutKey(this.built);
    if (key !== this.bgKey) {
      createBackground(this, key, this.airport);
      this.bg.setTexture(key).setScale(1 / TEX_SCALE);
      if (this.bgKey && this.textures.exists(this.bgKey)) this.textures.remove(this.bgKey);
      this.bgKey = key;
    }
    for (const t of this.gateLabels) t.destroy();
    this.gateLabels = [];
    for (const g of this.airport.gates) {
      const c = g.center(30);
      this.gateLabels.push(
        this.text(c.x, c.y, `EXIT ${g.id}`, 12, '#0b1410', 800)
          .setOrigin(0.5)
          .setBackgroundColor(GREEN_CSS)
          .setPadding(6, 3, 6, 3)
          .setDepth(13),
      );
    }
  }

  private hasOutbound() {
    return !!this.day.mix.transit || this.day.features.has('depart');
  }

  private startPlay() {
    this.mode = 'play';
    this.hideCard();
  }

  /** Starts from the saved career, or a brand new one after being fired. */
  private startCareer(fresh: boolean) {
    if (fresh) clearCareer();
    this.career = (fresh ? null : loadCareer()) ?? newCareer();
    this.setScore(this.career.cash);
    saveCareer(this.career);
    this.showDayIntro();
  }

  private endDay() {
    if (this.mode !== 'play') return;
    this.mode = 'summary';
    this.dragging = null;
    this.setSpeed(1);
    this.coach.clear();
    this.time0 = this.time.now;
    sfx.levelUp();
    const stats = this.dayStats;
    const finished = this.career.day;
    this.career = {
      ...this.career,
      day: finished + 1,
      cash: this.score,
      earned: this.career.earned + stats.earned,
      fresh: [],
    };
    saveCareer(this.career);
    this.saveBest(this.career.earned);
    this.time.delayedCall(500, () => {
      if (this.mode !== 'summary') return;
      this.showCard({
        kicker: `DAY ${finished}`,
        title: 'Shift over',
        stats: [
          ['EARNED', money(stats.earned)],
          ['LANDINGS', String(stats.landed)],
          ['DEPARTURES', String(stats.departed)],
          ['GREASED', String(stats.greased)],
        ],
        prompt: 'Click to open the build menu',
      });
    });
  }

  private openBuild() {
    this.mode = 'build';
    this.hideCard();
    for (const a of this.planes) this.destroyPlane(a);
    this.planes = [];
    this.clearRadio();
    this.built = new Set(this.career.built);
    this.applyLayout();
    this.buildMenu.show(this.career);
  }

  private buy(id: ItemId) {
    const item = itemById(id);
    if (this.career.cash < item.price || this.career.built.includes(id)) return;
    this.career = {
      ...this.career,
      cash: this.career.cash - item.price,
      built: [...this.career.built, id],
      fresh: [...this.career.fresh, id],
    };
    saveCareer(this.career);
    this.setScore(this.career.cash);
    this.built = new Set(this.career.built);
    this.applyLayout();
    this.buildMenu.refresh(this.career);
    sfx.buy();
  }

  private finishBuilding() {
    this.buildMenu.hide();
    this.showDayIntro();
  }

  private saveBest(total: number) {
    if (total <= this.best) return false;
    this.best = total;
    this.bestText.setText(money(this.best));
    this.layoutStatPanels();
    save(BEST_KEY, this.best);
    return true;
  }

  /** A crash or a plane running dry gets you fired: the whole career starts over. */
  private gameOver(a: Aircraft, b: Aircraft | null, title = 'Mid-air collision') {
    if (this.mode !== 'play') return;
    this.mode = 'fired';
    this.dragging = null;
    this.setSpeed(1);
    this.coach.clear();
    this.time0 = this.time.now;
    sfx.crash();
    this.explode(b ? (a.x + b.x) / 2 : a.x, b ? (a.y + b.y) / 2 : a.y);
    for (const p of b ? [a, b] : [a]) {
      const parts = [p.sprite, p.shadow, p.rotor, p.rotorShadow, p.tag, p.label].filter(Boolean);
      this.tweens.add({ targets: parts, alpha: 0, duration: 400 });
    }
    const days = this.career.day - 1;
    const total = this.career.earned + this.dayStats.earned;
    const newBest = this.saveBest(total);
    clearCareer();
    this.time.delayedCall(1100, () => {
      if (this.mode !== 'fired') return;
      this.showCard({
        kicker: `DAY ${this.career.day}  ·  ${title.toUpperCase()}`,
        title: "You're fired",
        stats: [
          ['DAYS SURVIVED', String(days)],
          [newBest ? 'NEW BEST' : 'CAREER EARNINGS', money(total)],
        ],
        prompt: 'Click to start over',
      });
    });
  }

  private explode(x: number, y: number) {
    this.cameras.main.shake(350, 0.006);
    const flash = this.add.circle(x, y, 10, 0xfff1c2, 1).setDepth(40);
    this.tweens.add({ targets: flash, scale: 7, alpha: 0, duration: 420, ease: 'Cubic.Out', onComplete: () => flash.destroy() });
    const ring = this.add.circle(x, y, 14).setStrokeStyle(3, 0xffffff, 0.9).setDepth(40);
    this.tweens.add({ targets: ring, scale: 6, alpha: 0, duration: 650, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    const colors = [0xff7a2f, 0xffc93c, 0xff4d3a, 0x55504a, 0x3a3632];
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 70;
      const c = this.add.circle(x, y, 3 + Math.random() * 6, colors[i % colors.length], 0.95).setDepth(41);
      this.tweens.add({
        targets: c,
        x: x + Math.cos(ang) * sp,
        y: y + Math.sin(ang) * sp,
        scale: 0.2 + Math.random() * 2,
        alpha: 0,
        duration: 600 + Math.random() * 900,
        ease: 'Cubic.Out',
        onComplete: () => c.destroy(),
      });
    }
  }

  // ---------------------------------------------------------------- tutorials

  private tutorial(key: string, msg: Omit<CoachMsg, 'key'>) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    save(SEEN_KEY, [...this.seen]);
    this.dragging = null;
    this.slowDown();
    sfx.coach();
    this.coach.show({ key, ...msg });
  }

  private approachGhost(a: Aircraft): Point[] {
    const dest = KINDS[a.kind].dest;
    if (dest === 'pad') {
      const pad = this.nearest(this.airport.pads, a);
      return [a, pad];
    }
    if (dest === 'gate' && a.gate) return [a, a.gate.exitPoint(a.gate.center())];
    const rw = this.airport.runways.find((r) => r.size === dest)!;
    const thr = rw.threshold();
    const ang = rw.angle();
    const ap = { x: thr.x - Math.cos(ang) * 80, y: thr.y - Math.sin(ang) * 80 };
    return [a, ap, thr];
  }

  /** Area to light up around the end of the demo route. */
  private ghostSpot(a: Aircraft) {
    const g = this.approachGhost(a);
    const end = g[g.length - 1];
    if (KINDS[a.kind].dest === 'gate') {
      const c = a.gate!.center(40);
      return { x: c.x, y: c.y, r: 70 };
    }
    if (KINDS[a.kind].dest === 'pad') return { x: end.x, y: end.y, r: 44 };
    const prev = g[g.length - 2];
    return { x: (end.x * 2 + prev.x) / 3, y: (end.y * 2 + prev.y) / 3, r: 64 };
  }

  private nearest<T extends Point>(pts: T[], p: Point) {
    return pts.reduce((b, q) => (dist(q, p) < dist(b, p) ? q : b));
  }

  private checkTutorials() {
    for (const a of this.planes) {
      if (a.state !== 'flying' || !a.entered) continue;
      if (a.x < 40 || a.x > W - 40 || a.y < 40 || a.y > H - 40) continue;
      const focus = { x: a.x, y: a.y, r: 32 };
      if (!isOutbound(a.kind)) {
        this.tutorial('basics', {
          kicker: 'HOW TO PLAY',
          title: 'Land it',
          text: 'Drag from the plane to the landing spot of the same color. Runways only work from the end with the arrows.',
          color: KINDS[a.kind].css,
          focus,
          ghost: this.approachGhost(a),
          spots: [this.ghostSpot(a)],
        });
      }
      if (a.fast) {
        this.tutorial('fast', {
          kicker: 'NEW',
          title: 'Fast plane',
          text: 'Speed streaks mean it moves quicker than the rest.',
          color: KINDS[a.kind].css,
          focus,
        });
      }
      if (a.fuelMax > 0) {
        this.tutorial('fuel', {
          kicker: 'MAYDAY',
          title: 'Low fuel',
          text: 'The ring shows the fuel left. Land it before the ring runs out.',
          color: '#ffb020',
          focus,
        });
      }
      if (a.kind === 'heavy') {
        this.tutorial('heavy', {
          kicker: 'NEW',
          title: 'Heavy jet',
          text: "It can't turn tight, so its route bends wide as you draw. Long runway only.",
          color: KINDS.heavy.css,
          focus: { ...focus, r: 40 },
        });
      }
      if (a.kind === 'transit' && a.gate) {
        this.tutorial('transit', {
          kicker: 'NEW',
          title: 'Overflight',
          text: `Not landing here. Send it out exit ${a.gate.id}.`,
          color: GREEN_CSS,
          focus,
          ghost: this.approachGhost(a),
          spots: [this.ghostSpot(a)],
        });
      }
    }
  }

  // ---------------------------------------------------------------- input

  private bindInput() {
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      this.music.start();
      const x = p.worldX;
      const y = p.worldY;
      // The build panel covers the HUD buttons, so it gets first pick of clicks.
      if (this.mode === 'build') {
        this.buildMenu.pointerDown(x, y);
        return;
      }
      if (this.mode === 'play' && this.hit(this.speedBtn, x, y)) {
        this.setSpeed(this.speedMul > 1 ? 1 : FAST_FORWARD);
        return;
      }
      if (this.hit(this.musicBtn, x, y)) {
        this.toggleMusic();
        return;
      }
      if (this.coach.dismiss()) return;
      switch (this.mode) {
        case 'title':
          this.startCareer(false);
          return;
        case 'intro':
          this.startPlay();
          return;
        case 'summary':
          if (this.time.now - this.time0 > 900) this.openBuild();
          return;
        case 'fired':
          if (this.time.now - this.time0 > 1200) this.startCareer(true);
          return;
      }
      if (this.hit(this.skipBtn, x, y)) {
        this.endDay();
        return;
      }
      if (this.paused) return;
      const ground = this.pickGround(x, y);
      if (ground) {
        this.clearGround(ground);
        return;
      }
      const plane = this.pick(x, y);
      if (!plane) return;
      this.dragging = plane;
      plane.path = [];
      plane.target = null;
      sfx.select();
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.mode === 'build') {
        this.buildMenu.pointerMove(p.worldX, p.worldY);
        return;
      }
      const plane = this.dragging;
      if (!plane) {
        this.hover = this.mode === 'play' ? this.pick(p.worldX, p.worldY) ?? this.pickGround(p.worldX, p.worldY) : null;
        return;
      }
      if (!p.isDown || plane.state !== 'flying') {
        this.dragging = null;
        return;
      }
      this.extendPath(plane, { x: p.worldX, y: p.worldY });
    });

    const release = () => (this.dragging = null);
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard;
    kb?.on('keydown-P', () => this.togglePause());
    kb?.on('keydown-M', () => this.toggleMusic());
    kb?.on('keydown-F', () => {
      if (this.mode === 'play') this.setSpeed(this.speedMul > 1 ? 1 : FAST_FORWARD);
    });
    kb?.on('keydown-SPACE', () => this.togglePause());
    kb?.on('keydown-N', () => {
      if (this.mode === 'play') {
        this.coach.clear();
        this.endDay();
      }
    });
    if (import.meta.env.DEV) {
      // Development shortcut for trying out the build menu.
      kb?.on('keydown-C', () => {
        if (this.mode !== 'build') return;
        this.career = { ...this.career, cash: this.career.cash + 10000 };
        saveCareer(this.career);
        this.setScore(this.career.cash);
        this.buildMenu.refresh(this.career);
      });
    }
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.mode !== 'title') return;
      if (e.key === 'r' || e.key === 'R') {
        this.seen.clear();
        save(SEEN_KEY, []);
        this.showBanner('Tips reset', GREEN_CSS);
      }
    });
  }

  private togglePause() {
    if (this.mode !== 'play' || this.coach.visible) return;
    this.paused = !this.paused;
    this.dragging = null;
    this.pauseText.setVisible(this.paused);
  }

  private pick(x: number, y: number) {
    let best: Aircraft | null = null;
    let bestD = PICK_RADIUS;
    for (const a of this.planes) {
      if (a.state !== 'flying' || !a.entered) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  private pickGround(x: number, y: number) {
    return this.planes.find((a) => (a.state === 'parked' || a.state === 'hold') && Math.hypot(a.x - x, a.y - y) < GROUND_PICK) ?? null;
  }

  private clearGround(a: Aircraft) {
    const rw = a.rw!;
    if (a.state === 'parked') {
      a.state = 'taxi';
      a.end = rw.active;
      a.route = this.airport.departureRoute(a.stand!);
      a.stand!.occupant = null;
      sfx.taxi();
      this.radio(`${a.callsign}, taxi to runway ${rw.labels[rw.active]}`);
      return;
    }
    // Holding short: clear for takeoff only if nothing is on or landing on the runway.
    const busy = rw.ground.size > 0 || this.planes.some((p) => p.state === 'final' && p.rw === rw);
    if (busy) {
      sfx.deny();
      this.popText(a.x, a.y, 'Runway busy', '#ff6b5e');
      return;
    }
    a.state = 'lineup';
    a.route = [rw.along(4, 0, a.end)];
    rw.ground.add(a);
    a.onRunway = true;
    sfx.taxi();
    this.radio(`${a.callsign}, cleared for takeoff runway ${rw.labels[a.end]}`);
  }

  private extendPath(a: Aircraft, raw: Point) {
    const p = { x: Phaser.Math.Clamp(raw.x, EDGE, W - EDGE), y: Phaser.Math.Clamp(raw.y, EDGE, H - EDGE) };
    let last: Point = a.path[a.path.length - 1] ?? a;
    const gap = dist(last, p);
    if (gap < PATH_STEP) return;
    const steps = Math.ceil(gap / PATH_STEP);
    if (a.kind === 'heavy') {
      // Heavies are limited to a minimum turn radius, so the path bends like a rope.
      const prev = a.path[a.path.length - 2] ?? (a.path.length ? a : null);
      let dir = prev ? Math.atan2(last.y - prev.y, last.x - prev.x) : a.heading;
      const maxTurn = PATH_STEP / HEAVY_TURN_RADIUS;
      for (let i = 0; i < steps; i++) {
        const want = Math.atan2(p.y - last.y, p.x - last.x);
        dir += Phaser.Math.Clamp(Angle.Wrap(want - dir), -maxTurn, maxTurn);
        const pt = {
          x: Phaser.Math.Clamp(last.x + Math.cos(dir) * PATH_STEP, EDGE, W - EDGE),
          y: Phaser.Math.Clamp(last.y + Math.sin(dir) * PATH_STEP, EDGE, H - EDGE),
        };
        if (this.addPoint(a, pt)) return;
        last = pt;
        if (dist(last, p) < PATH_STEP) return;
      }
      return;
    }
    const from = last;
    for (let i = 1; i <= steps; i++) {
      const pt = { x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps };
      if (this.addPoint(a, pt)) return;
    }
  }

  /** Adds a path point; returns true if the path locked onto a destination. */
  private addPoint(a: Aircraft, pt: Point) {
    a.path.push(pt);
    const lock = this.lockTarget(a, pt);
    if (!lock) return false;
    a.target = lock;
    if (lock.type === 'runway') a.path.push(lock.rw.threshold());
    else if (lock.type === 'pad') a.path.push({ ...lock.pad });
    else a.path.push(lock.gate.exitPoint(pt));
    this.dragging = null;
    sfx.lock();
    if (lock.type === 'runway') this.radio(`${a.callsign}, cleared to land runway ${lock.rw.labels[lock.rw.active]}`);
    else if (lock.type === 'pad') this.radio(`${a.callsign}, cleared to land helipad`);
    else this.radio(`${a.callsign}, cleared out via exit ${lock.gate.id}`);
    return true;
  }

  private lockTarget(a: Aircraft, pt: Point): Target | null {
    const dest = KINDS[a.kind].dest;
    if (dest === 'gate') {
      const g = a.gate;
      return g && g.depth(pt) < 36 && g.inSpan(pt) ? { type: 'gate', gate: g } : null;
    }
    if (dest === 'pad') {
      const pad = this.airport.pads.find((p) => dist(p, pt) < this.fx2.landingZone);
      return pad ? { type: 'pad', pad } : null;
    }
    for (const rw of this.airport.runways) {
      if (rw.size !== dest || dist(pt, rw.threshold()) > this.fx2.landingZone) continue;
      const from = a.path[a.path.length - 4] ?? a;
      const dir = Math.atan2(pt.y - from.y, pt.x - from.x);
      if (Math.abs(Angle.Wrap(dir - rw.angle())) < Phaser.Math.DegToRad(this.fx2.approachTolDeg)) return { type: 'runway', rw };
    }
    return null;
  }

  // ---------------------------------------------------------------- spawning

  private makePlane(kind: Kind, x: number, y: number, heading: number, fast: boolean): Aircraft {
    const shadow = this.add
      .image(x, y, `ac-${kind}`)
      .setScale(1 / TEX_SCALE)
      .setTint(0x000000)
      .setAlpha(0.28)
      .setDepth(10)
      .setRotation(heading);
    const sprite = this.add.image(x, y, `ac-${kind}`).setScale(1 / TEX_SCALE).setDepth(20).setRotation(heading);
    const a: Aircraft = {
      id: this.nextId++,
      kind,
      fast,
      x,
      y,
      heading,
      speed: KINDS[kind].speed * (0.92 + Math.random() * 0.16) * (fast ? FAST_MULT : 1),
      v: 0,
      state: 'flying',
      alt: 1,
      entered: false,
      warn: false,
      path: [],
      target: null,
      gate: null,
      rw: null,
      end: 0,
      along: 0,
      lateral: 0,
      onRunway: false,
      route: [],
      stand: null,
      fading: false,
      alpha: 1,
      sprite,
      shadow,
      bank: 0,
      phase: Math.random() * 10,
      trail: [],
      trailT: 0,
      callsign: '',
      label: null as unknown as Phaser.GameObjects.Text,
      fuel: 0,
      fuelMax: 0,
      grade: null,
      hist: [],
      holding: false,
      wait: 0,
    };
    a.callsign = this.makeCallsign(kind);
    a.label = this.text(x, y, a.callsign, 10, '#e8f0ea', 700).setOrigin(0.5, 0).setStroke('#0b1410', 3).setAlpha(0.85).setDepth(22);
    if (kind === 'heli') {
      a.rotorShadow = this.add.image(x, y, 'rotor').setScale(1 / TEX_SCALE).setTint(0x000000).setAlpha(0.2).setDepth(10);
      a.rotor = this.add.image(x, y, 'rotor').setScale(1 / TEX_SCALE).setDepth(21);
    }
    return a;
  }

  private assignGate(a: Aircraft, gate: Gate) {
    a.gate = gate;
    a.tag = this.text(a.x, a.y, gate.id, 11, '#0b1410', 800)
      .setOrigin(0.5)
      .setBackgroundColor(GREEN_CSS)
      .setPadding(4, 1, 4, 1)
      .setDepth(22);
  }

  /** How much attention the current traffic needs, in rough "unrouted plane" units. */
  private trafficLoad() {
    let load = 0;
    for (const a of this.planes) {
      if (a.state === 'flying') load += (a.target ? 0.6 : 1) + (a.fuelMax > 0 ? 0.5 : 0);
      else if (a.state === 'parked' || a.state === 'taxi' || a.state === 'hold') load += 0.35;
      else if (a.state !== 'gone') load += 0.25;
    }
    return load;
  }

  /** Director capacity follows the day's demand curve, peaking at rush hour. */
  private capacity() {
    return this.day.capacity * (0.75 + 0.25 * demand(hourAt(this.elapsed)));
  }

  /** How crowded each kind of destination is right now. */
  private destLoad(): Record<Dest, number> {
    const load: Record<Dest, number> = { long: 0, short: 0, pad: 0, gate: 0 };
    for (const a of this.planes) if (a.state === 'flying') load[KINDS[a.kind].dest] += 1;
    for (const rw of this.airport.runways) if (rw.ground.size) load[rw.size] += 0.5;
    return load;
  }

  /** A point on the approach to where this kind of aircraft is going. */
  private aimPoint(kind: Kind): Point {
    const dest = KINDS[kind].dest;
    if (dest === 'pad') return Phaser.Utils.Array.GetRandom(this.airport.pads);
    const runways = this.airport.runways.filter((r) => r.size === dest);
    if (!runways.length) return { x: W / 2, y: H / 2 };
    const rw: Runway = Phaser.Utils.Array.GetRandom(runways);
    const thr = rw.threshold();
    const ang = rw.angle();
    return { x: thr.x - Math.cos(ang) * 140, y: thr.y - Math.sin(ang) * 140 };
  }

  /** Returns false when the director decided the sky is too busy for a new arrival. */
  private spawnArrival() {
    if (!this.director.allowSpawn(this.trafficLoad(), this.capacity())) return false;
    const kind = this.director.pickKind(this.day.mix, this.destLoad());
    let gate: Gate | undefined;
    let aim: Point;
    if (kind === 'transit') {
      gate = Phaser.Utils.Array.GetRandom(this.airport.gates);
      const g = gate.center(0);
      aim = { x: (W / 2 + g.x) / 2, y: (H / 2 + g.y) / 2 };
    } else {
      aim = this.aimPoint(kind);
    }
    const fast = kind !== 'heavy' && Math.random() < this.day.fastChance;
    const speed = KINDS[kind].speed * (fast ? FAST_MULT : 1);
    const others = this.planes
      .filter((a) => this.inAir(a))
      .map((a) => ({ now: { x: a.x, y: a.y }, future: this.futurePath(a), incoming: !a.entered }));
    const e = this.director.pickEntry(aim, speed, others, PREDICT_STEP, gate?.edge);
    const a = this.makePlane(kind, e.x, e.y, e.heading, fast);
    if (gate) this.assignGate(a, gate);
    this.planes.push(a);
    sfx.incoming();
    const emergencyActive = this.planes.some((p) => p.fuelMax > 0 && p.state === 'flying');
    if (
      this.day.features.has('fuel') &&
      KINDS[kind].dest !== 'gate' &&
      !emergencyActive &&
      this.trafficLoad() < this.capacity() - 1 &&
      Math.random() < this.day.fuelChance
    ) {
      // Enough fuel for a direct approach with room to spare, but not for wandering.
      const reach = Math.hypot(aim.x - e.x, aim.y - e.y) / a.speed;
      a.fuelMax = a.fuel = Phaser.Math.Clamp(reach * 2.4 + 16, 32, 65);
      sfx.mayday();
      this.slowDown();
      this.radio(`MAYDAY, ${a.callsign}, low fuel`);
    }
    return true;
  }

  private spawnDeparture() {
    const waiting = this.planes.filter((a) => a.kind === 'depart' && a.state !== 'flying').length;
    if (waiting >= Math.min(3, Math.ceil(this.airport.stands.length / 2))) return;
    if (!this.director.allowSpawn(this.trafficLoad(), this.capacity() + 0.5)) return;
    const free = this.airport.stands.filter((s) => !s.occupant);
    if (!free.length) return;
    const stand = Phaser.Utils.Array.GetRandom(free);
    const a = this.makePlane('depart', stand.x, stand.y, stand.heading, false);
    a.state = 'parked';
    a.alt = 0;
    a.entered = true;
    a.stand = stand;
    a.rw = this.airport.runways[stand.mouth.runway];
    a.sprite.setDepth(14);
    stand.occupant = a;
    this.assignGate(a, Phaser.Utils.Array.GetRandom(this.airport.gates));
    this.planes.push(a);
    this.departSpawned++;
    sfx.incoming();
    this.time.delayedCall(600, () => {
      if (this.mode !== 'play' || a.state !== 'parked') return;
      this.tutorial('depart', {
        kicker: 'DEPARTURES',
        title: 'Ready to go',
        text: 'Click it to taxi out to the runway.',
        color: GREEN_CSS,
        focus: { x: a.x, y: a.y, r: 30 },
      });
    });
  }

  private destroyPlane(a: Aircraft) {
    a.sprite.destroy();
    a.shadow.destroy();
    a.rotor?.destroy();
    a.rotorShadow?.destroy();
    a.tag?.destroy();
    a.label.destroy();
    if (a.rw) a.rw.ground.delete(a);
    if (a.stand?.occupant === a) a.stand.occupant = null;
  }

  // ---------------------------------------------------------------- simulation

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    for (const c of this.clouds) {
      c.x += dt * 6;
      if (c.x - c.displayWidth / 2 > W) c.x = -c.displayWidth / 2;
    }

    const running = this.mode === 'play' && !this.paused && !this.coach.visible;
    if (running) {
      // Fast forward runs extra simulation steps rather than one big step, so nothing tunnels.
      for (let i = 0; i < this.speedMul && this.mode === 'play' && !this.coach.visible; i++) this.simulate(dt);
    }

    for (const a of this.planes) this.syncSprites(a, running ? dt * this.speedMul : 0);
    this.drawFx();
    this.drawStreak();
    this.coach.draw();
  }

  private simulate(dt: number) {
    this.elapsed += dt;
    const d = this.day;
    const hour = hourAt(this.elapsed);
    const busy = demand(hour);
    this.director.update(dt);
    if (this.streakLeft > 0) {
      this.streakLeft = Math.max(0, this.streakLeft - dt);
      if (this.streakLeft === 0) this.streak = 0;
    }
    if (!this.rushAnnounced && hour >= RUSH_START) {
      this.rushAnnounced = true;
      this.slowDown();
      sfx.wind();
      this.showBanner('Rush hour', '#ffc93c', 2500);
    }
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && hour < ARRIVALS_END) {
      // When the director holds an arrival back, check again shortly.
      this.spawnIn = this.spawnArrival() ? (d.interval / busy) * (0.8 + Math.random() * 0.4) : 1;
    }
    this.departIn -= dt;
    if (this.departIn <= 0 && hour < DEPARTURES_END) {
      this.spawnDeparture();
      this.departIn = rand(d.departEvery) / Math.max(0.7, busy);
    }
    if (this.fx2.autoTaxi) {
      for (const a of this.planes) {
        if (a.state !== 'parked') continue;
        a.wait += dt;
        if (a.wait > 1.5) this.clearGround(a);
      }
    }
    if (d.features.has('wind')) this.updateWind(dt);
    for (const a of this.planes) {
      if (this.mode !== 'play') break;
      this.step(a, dt);
    }
    for (const a of this.planes) if (a.state === 'gone') this.destroyPlane(a);
    this.planes = this.planes.filter((a) => a.state !== 'gone');
    if (this.mode === 'play') this.checkConflicts();
    if (this.mode === 'play') this.predictConflicts();
    if (this.mode === 'play') this.checkTutorials();
    if (this.mode === 'play') this.updateProgress();
    if (this.mode === 'play' && this.elapsed >= DAY_SECONDS) this.endDay();
  }

  private updateWind(dt: number) {
    this.windIn -= dt;
    const warning = this.fx2.windWarning;
    if (!this.windWarned && this.windIn <= warning) {
      this.windWarned = true;
      this.slowDown();
      sfx.wind();
      this.showBanner(`Wind shift in ${warning}`, '#ffc93c', 3000);
      const rw = this.airport.runways[0];
      const c = rw.center(rw.length / 2);
      this.tutorial('wind', {
        kicker: 'NEW',
        title: 'Wind shift',
        text: `In ${warning} seconds the runways flip. The blinking arrows show the new approach. Routes to the old end get cancelled.`,
        color: '#ffc93c',
        focus: { x: c.x, y: c.y, r: rw.length / 2 + 30 },
      });
    }
    if (this.windIn > 0) return;
    this.windIn = rand(this.day.windEvery);
    this.windWarned = false;
    for (const rw of this.airport.runways) rw.active = rw.active === 0 ? 1 : 0;
    for (const a of this.planes) {
      if (a.state === 'flying' && a.target?.type === 'runway') {
        a.target = null;
        a.path.pop();
      }
      if (a.state === 'taxi' || a.state === 'hold') this.reroute(a);
    }
    sfx.wind();
    this.showBanner('Runways flipped', '#ffc93c');
  }

  /** Sends a taxiing departure to the new active end after a wind shift. */
  private reroute(a: Aircraft) {
    const rw = a.rw!;
    const oldEnd = a.end;
    a.end = rw.active;
    const oldTaxi = rw.taxi(oldEnd === 0 ? 0 : rw.length);
    const tail = [rw.taxi(a.end === 0 ? 0 : rw.length), rw.hold(a.end)];
    if (a.state === 'hold' || a.route.length <= 1) a.route = [oldTaxi, ...tail];
    else if (a.route.length === 2) a.route = tail;
    else a.route = [...a.route.slice(0, a.route.length - 2), ...tail];
    a.state = 'taxi';
  }

  /** Moves along a.route at speed; returns true when the route is finished. */
  private followRoute(a: Aircraft, speed: number, dt: number) {
    let d = speed * dt;
    while (d > 0 && a.route.length) {
      const p = a.route[0];
      const seg = dist(a, p);
      if (seg > 0.01) a.heading = Math.atan2(p.y - a.y, p.x - a.x);
      if (seg <= d) {
        a.x = p.x;
        a.y = p.y;
        d -= seg;
        a.route.shift();
      } else {
        a.x += ((p.x - a.x) / seg) * d;
        a.y += ((p.y - a.y) / seg) * d;
        d = 0;
      }
    }
    return a.route.length === 0;
  }

  private step(a: Aircraft, dt: number) {
    switch (a.state) {
      case 'flying':
        return this.stepFlying(a, dt);
      case 'final':
        return a.target?.type === 'pad' ? this.stepHeliLanding(a, dt) : this.stepFinal(a, dt);
      case 'vacate': {
        const rw = a.rw!;
        this.followRoute(a, a.onRunway ? this.fx2.exitSpeed : TAXI_SPEED, dt);
        if (a.onRunway) {
          const c = rw.center(rw.length / 2);
          const off = Math.abs((a.x - c.x) * rw.nx + (a.y - c.y) * rw.ny);
          if (off > rw.width / 2 + 6) {
            rw.ground.delete(a);
            a.onRunway = false;
            a.fading = true;
          }
        }
        if (a.fading) this.fade(a, dt);
        return;
      }
      case 'taxi': {
        if (this.blockedOnTaxi(a)) return;
        if (this.followRoute(a, TAXI_SPEED, dt)) {
          a.state = 'hold';
          a.heading = Math.atan2(-a.rw!.ny, -a.rw!.nx);
          this.tutorial('hold', {
            kicker: 'DEPARTURES',
            title: 'Holding short',
            text: `Click again to take off once the runway is clear, then send it out exit ${a.gate!.id}.`,
            color: GREEN_CSS,
            focus: { x: a.x, y: a.y, r: 30 },
          });
        }
        return;
      }
      case 'lineup':
        if (this.followRoute(a, 12, dt)) {
          a.state = 'takeoff';
          a.along = 4;
          a.v = 8;
          sfx.takeoff();
        }
        return;
      case 'takeoff':
        return this.stepTakeoff(a, dt);
      case 'gone':
      case 'parked':
      case 'hold':
        return;
    }
  }

  private fade(a: Aircraft, dt: number) {
    a.alpha -= dt * 1.4;
    if (a.alpha <= 0) a.state = 'gone';
  }

  private blockedOnTaxi(a: Aircraft) {
    const hx = Math.cos(a.heading);
    const hy = Math.sin(a.heading);
    return this.planes.some((o) => {
      if (o === a || !(o.state === 'taxi' || o.state === 'hold' || o.state === 'lineup')) return false;
      const dx = o.x - a.x;
      const dy = o.y - a.y;
      const d = Math.hypot(dx, dy);
      return d < 26 && (dx * hx + dy * hy) / (d || 1) > 0.5;
    });
  }

  private stepFlying(a: Aircraft, dt: number) {
    if (a.fuelMax > 0) {
      a.fuel -= dt;
      if (a.fuel <= 0) {
        this.gameOver(a, null, 'Out of fuel');
        return;
      }
    }
    const last = a.hist[a.hist.length - 1];
    if (!last || dist(last, a) >= 6) {
      a.hist.push({ x: a.x, y: a.y });
      if (a.hist.length > 14) a.hist.shift();
    }
    // Helicopters hover short of a helipad that another one is still landing on.
    const pad = a.target?.type === 'pad' ? a.target.pad : null;
    if (pad && dist(a, pad) < 60 && this.padBusy(pad, a)) {
      if (!a.holding) this.radio(`${a.callsign}, holding for the helipad`);
      a.holding = true;
      return;
    }
    a.holding = false;
    let d = a.speed * dt;
    while (d > 0 && a.path.length) {
      const p = a.path[0];
      const seg = dist(a, p);
      if (seg > 0.001) a.heading = Math.atan2(p.y - a.y, p.x - a.x);
      if (seg <= d) {
        a.x = p.x;
        a.y = p.y;
        d -= seg;
        a.path.shift();
      } else {
        a.x += ((p.x - a.x) / seg) * d;
        a.y += ((p.y - a.y) / seg) * d;
        d = 0;
      }
    }
    if (!a.path.length && a.target && a.target.type !== 'gate' && this.dragging !== a) {
      const t = a.target;
      if (t.type === 'runway' && this.runwayBusy(t.rw, a)) this.goAround(a, t.rw);
      else {
        this.beginFinal(a);
        return;
      }
    }
    if (d > 0) {
      a.x += Math.cos(a.heading) * d;
      a.y += Math.sin(a.heading) * d;
    }
    if (!a.entered && a.x > EDGE && a.x < W - EDGE && a.y > EDGE && a.y < H - EDGE) a.entered = true;
    if (a.gate && a.gate.depth(a) < -14 && a.gate.inSpan(a, 30)) {
      this.exitGate(a);
      return;
    }
    if (a.entered && !a.path.length) this.bounce(a);
  }

  private bounce(a: Aircraft) {
    const cx = Math.cos(a.heading);
    const cy = Math.sin(a.heading);
    // Outbound traffic flying into its own gate is allowed to leave.
    if (a.gate && a.gate.inSpan(a)) {
      const out = a.gate.outAngle;
      if (Math.cos(a.heading - out) > 0 && a.gate.depth(a) < EDGE + 2) return;
    }
    if ((a.x < EDGE && cx < 0) || (a.x > W - EDGE && cx > 0)) a.heading = Math.atan2(cy, -cx);
    if ((a.y < EDGE && cy < 0) || (a.y > H - EDGE && cy > 0)) a.heading = Math.atan2(-cy, cx);
  }

  private padBusy(pad: Point, except: Aircraft) {
    return this.planes.some(
      (p) => p !== except && p.state === 'final' && p.target?.type === 'pad' && p.target.pad === pad && p.alt > 0,
    );
  }

  private runwayBusy(rw: Runway, except?: Aircraft) {
    return rw.ground.size > 0 || this.planes.some((p) => p !== except && p.state === 'final' && p.rw === rw);
  }

  /** The runway is in use: abort the landing and climb out straight ahead. */
  private goAround(a: Aircraft, rw: Runway) {
    a.target = null;
    a.path = [];
    a.heading = rw.angle();
    sfx.goAround();
    this.director.bump(1);
    this.popText(a.x, a.y, 'Go around', '#ffc93c');
    this.radio(`${a.callsign}, going around`);
  }

  private exitGate(a: Aircraft) {
    a.state = 'gone';
    if (a.kind === 'depart') this.dayStats.departed++;
    const c = a.gate!.center(46);
    this.earn(a, c);
    sfx.exit();
  }

  /** Pays out for a handled aircraft: fare, streak multiplier, approach bonus and emergency bonus. */
  private earn(a: Aircraft, at: Point) {
    this.streak = this.streakLeft > 0 ? this.streak + 1 : 1;
    this.streakLeft = STREAK_WINDOW;
    const gradeMult = a.grade === 'greased' ? 1.5 : a.grade === 'smooth' ? 1.2 : 1;
    const emergency = a.fuelMax > 0 ? EMERGENCY_BONUS : 0;
    const amount =
      Math.round((FARES[a.kind] * this.fx2.fareMult * this.multiplier() * gradeMult + emergency) / 10) * 10;
    this.dayStats.earned += amount;
    if (a.grade === 'greased') this.dayStats.greased++;
    this.setScore(this.score + amount);
    this.bumpScore();
    this.popText(at.x, at.y, `+${money(amount)}`, emergency ? '#ffb020' : KINDS[a.kind].css);
    if (a.grade) {
      this.popText(at.x, at.y - 22, a.grade === 'greased' ? 'Greased it!' : 'Smooth', '#ffffff');
      if (a.grade === 'greased') sfx.greased();
    }
  }

  private bumpScore() {
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.35, to: 1 }, duration: 260, ease: 'Back.Out' });
  }

  private beginFinal(a: Aircraft) {
    const t = a.target!;
    a.state = 'final';
    a.warn = false;
    a.sprite.setDepth(15);
    a.rotor?.setDepth(16);
    if (t.type !== 'runway') return;
    const rw = t.rw;
    a.rw = rw;
    a.end = rw.active;
    const thr = rw.threshold(a.end);
    const ang = rw.angle(a.end);
    // Judge the approach by the track over roughly the last 50 px before the threshold.
    const back = a.hist.find((p) => dist(p, thr) <= 60) ?? a.hist[0];
    if (back && dist(back, thr) > 20) {
      const dev = Math.abs(Angle.Wrap(Math.atan2(thr.y - back.y, thr.x - back.x) - ang));
      a.grade = dev < Phaser.Math.DegToRad(8) ? 'greased' : dev < Phaser.Math.DegToRad(18) ? 'smooth' : null;
    }
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const rx = a.x - thr.x;
    const ry = a.y - thr.y;
    a.along = Math.max(0, rx * dx + ry * dy);
    a.lateral = -rx * dy + ry * dx;
    a.v = a.speed;
  }

  private stepFinal(a: Aircraft, dt: number) {
    const rw = a.rw!;
    const touch = rw.length * 0.14;
    const exit = rw.length * rw.exitFrac;
    if (a.along < touch) a.v = a.speed * 0.9;
    else {
      const k = Phaser.Math.Clamp((a.along - touch) / (exit - touch), 0, 1);
      a.v = Phaser.Math.Linear(a.speed * 0.85, this.fx2.exitSpeed, k);
    }
    a.along += a.v * dt;
    a.lateral *= Math.max(0, 1 - dt * 4);
    a.alt = Math.max(0, 1 - a.along / touch);
    const p = rw.along(a.along, a.lateral, a.end);
    a.x = p.x;
    a.y = p.y;
    a.heading = Angle.RotateTo(a.heading, rw.angle(a.end), dt * 4);
    if (a.alt === 0 && !a.onRunway) {
      this.touchdown(a);
      if (this.mode !== 'play') return;
    }
    if (a.along >= exit) {
      const [, taxiS] = rw.exit(a.end);
      const further = taxiS + (a.end === 0 ? 40 : -40);
      a.state = 'vacate';
      a.route = [rw.taxi(taxiS), rw.taxi(further)];
    }
  }

  private touchdown(a: Aircraft) {
    const rw = a.rw!;
    rw.ground.add(a);
    a.onRunway = true;
    this.scoreLanding(a);
    this.tyreSmoke(a, rw);
    const c = rw.center(rw.length / 2);
    this.tutorial('occupancy', {
      kicker: 'TIP',
      title: 'One at a time',
      text: 'A runway turns red while a plane is on it. Anything that arrives then has to go around.',
      color: '#ff6b5e',
      focus: { x: c.x, y: c.y, r: rw.length / 2 + 26 },
    });
  }

  private tyreSmoke(a: Aircraft, rw: Runway) {
    const ang = rw.angle(a.end);
    const px = -Math.sin(ang);
    const py = Math.cos(ang);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const puff = this.add
        .circle(a.x + px * side * 4, a.y + py * side * 4, 2 + Math.random() * 1.5, 0xe8e8e4, 0.55)
        .setDepth(13);
      this.tweens.add({
        targets: puff,
        x: puff.x - Math.cos(ang) * (10 + Math.random() * 14) + px * side * 3,
        y: puff.y - Math.sin(ang) * (10 + Math.random() * 14) + py * side * 3,
        scale: 3 + Math.random() * 2,
        alpha: 0,
        duration: 700 + Math.random() * 500,
        ease: 'Cubic.Out',
        onComplete: () => puff.destroy(),
      });
    }
  }

  private scoreLanding(a: Aircraft) {
    this.dayStats.landed++;
    this.earn(a, a);
    sfx.land(this.streak);
    if (a.fuelMax > 0) this.radio(`${a.callsign}, on the ground, thank you`);
  }

  private stepHeliLanding(a: Aircraft, dt: number) {
    const pad = (a.target as { pad: Point }).pad;
    if (a.alt > 0) {
      a.alt = Math.max(0, a.alt - dt * 0.6);
      a.x += (pad.x - a.x) * Math.min(1, dt * 3);
      a.y += (pad.y - a.y) * Math.min(1, dt * 3);
      if (a.alt === 0) {
        this.scoreLanding(a);
        a.fading = true;
      }
      return;
    }
    this.fade(a, dt * 0.6);
  }

  private stepTakeoff(a: Aircraft, dt: number) {
    const rw = a.rw!;
    a.v = Math.min(a.speed * 1.25, a.v + 26 * dt);
    a.along += a.v * dt;
    a.alt = Phaser.Math.Clamp((a.along - rw.length * 0.5) / (rw.length * 0.35), 0, 1);
    const p = rw.along(a.along, 0, a.end);
    a.x = p.x;
    a.y = p.y;
    a.heading = Angle.RotateTo(a.heading, rw.angle(a.end), dt * 5);
    if (a.onRunway && a.alt > 0.35) {
      rw.ground.delete(a);
      a.onRunway = false;
    }
    if (a.alt >= 1) {
      a.state = 'flying';
      a.entered = true;
      a.path = [];
      a.target = null;
      a.sprite.setDepth(20);
    }
  }

  private inAir(a: Aircraft) {
    if (a.state === 'flying') return true;
    return (a.state === 'final' || a.state === 'takeoff') && a.alt > 0.4;
  }

  private checkConflicts() {
    const air = this.planes.filter((a) => this.inAir(a));
    for (const a of this.planes) a.warn = false;
    let newWarn = false;
    for (let i = 0; i < air.length; i++) {
      for (let j = i + 1; j < air.length; j++) {
        const a = air[i];
        const b = air[j];
        const d = dist(a, b);
        const r = KINDS[a.kind].radius + KINDS[b.kind].radius;
        if (d < r) {
          this.gameOver(a, b);
          return;
        }
        if (d < r + WARN_GAP) {
          newWarn ||= !a.warn && !b.warn;
          a.warn = b.warn = true;
        }
      }
    }
    if (newWarn) {
      this.director.bump(1);
      this.slowDown();
    }
    if (newWarn && this.time.now - this.lastWarnSfx > 900) {
      this.lastWarnSfx = this.time.now;
      sfx.warn();
    }
  }

  /** Where an airborne aircraft will be at each prediction step, following its route. */
  private futurePath(a: Aircraft): Point[] {
    const pts: Point[] = [];
    let x = a.x;
    let y = a.y;
    let h = a.heading;
    let idx = 0;
    const path = a.state === 'flying' ? a.path : [];
    const landing = a.target !== null && a.target.type !== 'gate';
    const steps = this.fx2.predictSeconds / PREDICT_STEP;
    if (a.holding) return Array.from({ length: steps }, () => ({ x, y }));
    for (let i = 0; i < steps; i++) {
      let d = a.speed * PREDICT_STEP;
      while (d > 0 && idx < path.length) {
        const p = path[idx];
        const seg = Math.hypot(p.x - x, p.y - y);
        if (seg > 0.001) h = Math.atan2(p.y - y, p.x - x);
        if (seg <= d) {
          x = p.x;
          y = p.y;
          d -= seg;
          idx++;
        } else {
          x += ((p.x - x) / seg) * d;
          y += ((p.y - y) / seg) * d;
          d = 0;
        }
      }
      if (d > 0) {
        // A plane that reaches its landing spot leaves the sky.
        if (landing && idx >= path.length) break;
        x += Math.cos(h) * d;
        y += Math.sin(h) * d;
      }
      pts.push({ x, y });
    }
    return pts;
  }

  private predictConflicts() {
    const air = this.planes.filter((a) => a.state === 'flying' || (a.state === 'takeoff' && a.alt > 0.4));
    const future = new Map(air.map((a) => [a, this.futurePath(a)]));
    const found: Conflict[] = [];
    const keys = new Set<string>();
    for (let i = 0; i < air.length; i++) {
      for (let j = i + 1; j < air.length; j++) {
        const a = air[i];
        const b = air[j];
        if (!a.entered && !b.entered) continue;
        const pa = future.get(a)!;
        const pb = future.get(b)!;
        const r = KINDS[a.kind].radius + KINDS[b.kind].radius + 6;
        const n = Math.min(pa.length, pb.length);
        for (let k = 0; k < n; k++) {
          if (dist(pa[k], pb[k]) < r) {
            found.push({ a, b, x: (pa[k].x + pb[k].x) / 2, y: (pa[k].y + pb[k].y) / 2 });
            keys.add(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`);
            break;
          }
        }
      }
    }
    const fresh = [...keys].some((k) => !this.conflictKeys.has(k));
    this.conflicts = found;
    this.conflictKeys = keys;
    if (fresh) {
      this.director.bump(0.6);
      this.slowDown();
    }
    if (fresh && this.time.now - this.lastConflictSfx > 1200) {
      this.lastConflictSfx = this.time.now;
      sfx.conflict();
    }
    const c = found[0];
    if (c && c.a.entered && c.b.entered) {
      const r = Math.max(dist(c.a, c), dist(c.b, c)) + 30;
      this.tutorial('conflict', {
        kicker: 'HEADS UP',
        title: 'Collision course',
        text: 'The dashed lines show where two planes will meet. Change one of their routes.',
        color: '#ffb020',
        focus: { x: c.x, y: c.y, r: Math.min(r, 160) },
      });
    }
  }

  private syncSprites(a: Aircraft, dt: number) {
    if (a.state === 'gone') return;
    const prevRot = a.sprite.rotation;
    const rot = dt > 0 ? Angle.RotateTo(prevRot, a.heading, dt * 7) : prevRot;
    if (dt > 0) {
      // Bank into turns: the wings foreshorten in proportion to the turn rate.
      const turn = Angle.Wrap(rot - prevRot) / dt;
      a.bank += (Phaser.Math.Clamp(turn / 1.3, -1, 1) - a.bank) * Math.min(1, dt * 6);
    }
    const t = this.time.now / 1000;
    const bob = a.alt > 0.95 ? 1 + 0.016 * Math.sin(t * 1.6 + a.phase) : 1;
    const s = ((0.82 + 0.18 * a.alt) / TEX_SCALE) * bob;
    const sy = s * (1 - 0.24 * Math.abs(a.bank));
    a.sprite.setPosition(a.x, a.y).setRotation(rot).setScale(s, sy);
    const lift = a.alt * bob;
    a.shadow.setPosition(a.x + 9 * lift + 1, a.y + 12 * lift + 1).setRotation(rot).setScale(s, sy);
    if (dt > 0) {
      a.trailT += dt;
      if (a.trailT >= 0.05) {
        a.trailT = 0;
        if (ENGINES[a.kind] && a.state === 'flying' && a.alt >= 0.99) a.trail.push({ x: a.x, y: a.y, h: rot });
        else a.trail.shift();
        if (a.trail.length > 18) a.trail.shift();
      }
    }
    if (a.fading || this.mode === 'fired') {
      const alpha = Math.max(0, a.alpha);
      a.sprite.setAlpha(Math.min(a.sprite.alpha, alpha));
      a.shadow.setAlpha(Math.min(a.shadow.alpha, alpha * 0.28));
      a.rotor?.setAlpha(Math.min(a.rotor.alpha, alpha));
      a.rotorShadow?.setAlpha(Math.min(a.rotorShadow.alpha, alpha * 0.2));
      a.tag?.setAlpha(Math.min(a.tag.alpha, alpha));
    }
    if (a.rotor && a.rotorShadow) {
      a.rotor.setPosition(a.x + Math.cos(rot), a.y + Math.sin(rot)).setScale(s);
      a.rotor.rotation += dt * (8 + 22 * a.alt);
      a.rotorShadow.setPosition(a.shadow.x, a.shadow.y).setRotation(a.rotor.rotation).setScale(s);
    }
    a.tag?.setPosition(a.x + 15, a.y - 15);
    a.label.setPosition(a.x, a.y + (a.kind === 'heavy' ? 24 : 18));
    a.label.setAlpha(Math.min(0.85, a.sprite.alpha));
    if (a.fuelMax > 0) a.label.setColor('#ffb020');
  }

  // ---------------------------------------------------------------- drawing

  private chevrons(g: Phaser.GameObjects.Graphics, rw: Runway, e: 0 | 1, color: number, strong: boolean, t: number) {
    const thr = rw.threshold(e);
    const ang = rw.angle(e);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    for (let i = 0; i < 3; i++) {
      const back = 22 + i * 13;
      const phase = (((t * 1.6 - i * 0.33) % 1) + 1) % 1;
      const alpha = (strong ? 0.55 : 0.2) + (strong ? 0.45 : 0.25) * (1 - phase);
      const cx = thr.x - dx * back;
      const cy = thr.y - dy * back;
      g.lineStyle(strong ? 3 : 2.4, color, alpha);
      g.beginPath();
      g.moveTo(cx - dx * 6 - dy * 7, cy - dy * 6 + dx * 7);
      g.lineTo(cx, cy);
      g.lineTo(cx - dx * 6 + dy * 7, cy - dy * 6 - dx * 7);
      g.strokePath();
    }
  }

  private drawContrail(g: Phaser.GameObjects.Graphics, a: Aircraft) {
    const eng = ENGINES[a.kind];
    if (!eng || a.trail.length < 2 || a.state === 'gone') return;
    const pts = [...a.trail, { x: a.x, y: a.y, h: a.sprite.rotation }];
    const n = pts.length;
    for (const side of [-1, 1]) {
      for (let i = 1; i < n; i++) {
        const p = pts[i - 1];
        const q = pts[i];
        const at = (o: { x: number; y: number; h: number }) => ({
          x: o.x + Math.cos(o.h) * eng[0] - Math.sin(o.h) * eng[1] * side,
          y: o.y + Math.sin(o.h) * eng[0] + Math.cos(o.h) * eng[1] * side,
        });
        const a0 = at(p);
        const a1 = at(q);
        g.lineStyle(1.3 + (i / n) * 0.6, 0xffffff, 0.3 * (i / n) * a.sprite.alpha);
        g.beginPath();
        g.moveTo(a0.x, a0.y);
        g.lineTo(a1.x, a1.y);
        g.strokePath();
      }
    }
  }

  private drawConflicts(g: Phaser.GameObjects.Graphics, t: number) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 10);
    for (const c of this.conflicts) {
      for (const p of [c.a, c.b]) {
        // Dashed line from each plane to the predicted meeting point.
        const d = dist(p, c);
        const ux = (c.x - p.x) / (d || 1);
        const uy = (c.y - p.y) / (d || 1);
        g.lineStyle(1.8, AMBER, 0.8);
        for (let s0 = 14; s0 < d - 10; s0 += 10) {
          const s1 = Math.min(s0 + 5, d - 10);
          g.beginPath();
          g.moveTo(p.x + ux * s0, p.y + uy * s0);
          g.lineTo(p.x + ux * s1, p.y + uy * s1);
          g.strokePath();
        }
        if (!p.warn) {
          g.lineStyle(2, AMBER, 0.4 + 0.5 * pulse);
          g.strokeCircle(p.x, p.y, KINDS[p.kind].radius + 12);
        }
      }
      g.fillStyle(AMBER, 0.25 + 0.2 * pulse);
      g.fillCircle(c.x, c.y, 11);
      g.lineStyle(2, AMBER, 0.9);
      g.strokeCircle(c.x, c.y, 11);
      g.fillStyle(0xffffff, 1);
      g.fillRect(c.x - 1.2, c.y - 6, 2.4, 7);
      g.fillCircle(c.x, c.y + 4, 1.4);
    }
  }

  /** Navigation lights, strobes, beacons and spinning propellers. */
  private drawLights(t: number) {
    const g = this.navLights;
    g.clear();
    for (const a of this.planes) {
      if (a.state === 'gone' || a.state === 'parked') continue;
      const alpha = a.sprite.alpha;
      const rot = a.sprite.rotation;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      const sx = a.sprite.scaleX * TEX_SCALE;
      const sy = a.sprite.scaleY * TEX_SCALE;
      const at = (lx: number, ly: number) => ({
        x: a.x + lx * sx * c - ly * sy * sn,
        y: a.y + lx * sx * sn + ly * sy * c,
      });
      const light = (p: Point, color: number, r: number, k = 1) => {
        g.fillStyle(color, 0.22 * alpha * k);
        g.fillCircle(p.x, p.y, r * 2.6);
        g.fillStyle(color, alpha * k);
        g.fillCircle(p.x, p.y, r);
      };
      const tip = WINGTIPS[a.kind];
      if (tip) {
        const port = at(tip[0], -tip[1]);
        const star = at(tip[0], tip[1]);
        light(port, 0xff4040, 1.1);
        light(star, 0x40ff70, 1.1);
        if ((t + a.phase) % 1.3 < 0.07) {
          light(port, 0xffffff, 1.8);
          light(star, 0xffffff, 1.8);
        }
      }
      const beacon = (t * 1.1 + a.phase) % 1;
      if (beacon < 0.18) light(at(-3, 0), 0xff3030, 1.3, 1 - beacon / 0.18);
      if (a.kind === 'prop') {
        // Two-blade prop seen from above: the blade length flickers as it spins.
        const len = 8 * Math.abs(Math.sin(t * 47 + a.phase));
        const p0 = at(19.5, -len);
        const p1 = at(19.5, len);
        g.lineStyle(1.4, 0x2a3340, 0.75 * alpha);
        g.beginPath();
        g.moveTo(p0.x, p0.y);
        g.lineTo(p1.x, p1.y);
        g.strokePath();
      }
    }
  }

  private drawFx() {
    const g = this.fx;
    g.clear();
    const t = this.time.now / 1000;
    const drag = this.dragging;
    const dragDest = drag ? KINDS[drag.kind].dest : null;

    for (const rw of this.airport.runways) {
      const color = rw.size === 'long' ? KINDS.jet.color : KINDS.prop.color;
      if (rw.ground.size) {
        // Occupied runways glow red.
        const a = rw.center(-8);
        const b = rw.center(rw.length + 8);
        const hw = rw.width / 2 + 2;
        g.fillStyle(0xff3b30, 0.22 + 0.1 * Math.sin(t * 6));
        g.fillPoints(
          [
            new Phaser.Math.Vector2(a.x + rw.nx * hw, a.y + rw.ny * hw),
            new Phaser.Math.Vector2(b.x + rw.nx * hw, b.y + rw.ny * hw),
            new Phaser.Math.Vector2(b.x - rw.nx * hw, b.y - rw.ny * hw),
            new Phaser.Math.Vector2(a.x - rw.nx * hw, a.y - rw.ny * hw),
          ],
          true,
        );
      }
      const strong = dragDest === rw.size;
      this.chevrons(g, rw, rw.active, color, strong, t);
      if (this.windWarned && Math.sin(t * 10) > 0) this.chevrons(g, rw, rw.active === 0 ? 1 : 0, 0xffffff, true, t);
      if (strong) {
        const thr = rw.threshold();
        g.lineStyle(2, color, 0.5 + 0.3 * Math.sin(t * 8));
        g.strokeCircle(thr.x, thr.y, this.fx2.landingZone);
      }
    }
    for (const pad of this.airport.pads) {
      const active = dragDest === 'pad';
      g.lineStyle(2, KINDS.heli.color, active ? 0.6 + 0.4 * Math.sin(t * 8) : 0.25);
      g.strokeCircle(pad.x, pad.y, this.fx2.landingZone + 4 + (active ? Math.sin(t * 8) * 2 : 0));
    }

    if (this.hasOutbound()) {
      for (const gate of this.airport.gates) {
        const active = drag?.gate === gate;
        const out = gate.outAngle;
        const ox = Math.cos(out);
        const oy = Math.sin(out);
        const px = -oy;
        const py = ox;
        const c = gate.center(3);
        const half = gate.span / 2;
        g.lineStyle(6, GREEN, active ? 0.95 : 0.7);
        g.beginPath();
        g.moveTo(c.x - px * half, c.y - py * half);
        g.lineTo(c.x + px * half, c.y + py * half);
        g.strokePath();
        for (let i = 0; i < 2; i++) {
          const phase = (((t * 1.2 + i * 0.5) % 1) + 1) % 1;
          const base = gate.center(30 - phase * 18);
          g.lineStyle(2.4, GREEN, (active ? 0.9 : 0.5) * (1 - phase));
          for (const side of [-1, 1]) {
            const sx = base.x + px * side * 34;
            const sy = base.y + py * side * 34;
            g.beginPath();
            g.moveTo(sx - ox * 5 - px * 6, sy - oy * 5 - py * 6);
            g.lineTo(sx, sy);
            g.lineTo(sx - ox * 5 + px * 6, sy - oy * 5 + py * 6);
            g.strokePath();
          }
        }
      }
    }

    for (const a of this.planes) this.drawContrail(g, a);
    this.drawConflicts(g, t);
    this.drawLights(t);

    for (const a of this.planes) {
      const color = KINDS[a.kind].color;
      if (a.state === 'parked' || a.state === 'hold') {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        g.lineStyle(2, a.state === 'hold' ? GREEN : 0xffffff, 0.35 + 0.5 * pulse);
        g.strokeCircle(a.x, a.y, 15 + pulse * 2);
        if (a === this.hover) {
          g.lineStyle(2, 0xffffff, 0.9);
          g.strokeCircle(a.x, a.y, 21);
        }
        continue;
      }
      if (a.state !== 'flying') continue;

      if (a.path.length) {
        const locked = a.target?.type === 'runway' && a.target.rw.ground.size > 0;
        g.fillStyle(locked ? 0xff6b5e : color, a.target ? 0.95 : 0.75);
        let prev: Point = a;
        let carry = 6;
        for (const p of a.path) {
          let seg = dist(prev, p);
          let ox = prev.x;
          let oy = prev.y;
          while (carry <= seg) {
            ox += ((p.x - ox) / seg) * carry;
            oy += ((p.y - oy) / seg) * carry;
            seg -= carry;
            carry = 8;
            g.fillCircle(ox, oy, 1.9);
          }
          carry -= seg;
          prev = p;
        }
        const end = a.target?.type === 'gate' ? a.path[a.path.length - 2] ?? a : a.path[a.path.length - 1];
        if (a.target) {
          g.lineStyle(2, locked ? 0xff6b5e : color, 0.9);
          g.strokeCircle(end.x, end.y, 7);
        } else {
          g.fillCircle(end.x, end.y, 4);
        }
      }

      if (a.fast) {
        // Speed streaks behind fast traffic.
        const bx = -Math.cos(a.sprite.rotation);
        const by = -Math.sin(a.sprite.rotation);
        const px = -by;
        const py = bx;
        g.lineStyle(1.6, 0xffffff, 0.55);
        for (const side of [-1, 0, 1]) {
          const len = side === 0 ? 16 : 10;
          const sx = a.x + bx * 15 + px * side * 6;
          const sy = a.y + by * 15 + py * side * 6;
          const phase = (t * 6 + side) % 1;
          g.beginPath();
          g.moveTo(sx + bx * phase * 3, sy + by * phase * 3);
          g.lineTo(sx + bx * (len + phase * 3), sy + by * (len + phase * 3));
          g.strokePath();
        }
      }

      if (!a.entered) {
        const ex = Phaser.Math.Clamp(a.x, 22, W - 22);
        const ey = Phaser.Math.Clamp(a.y, 22, H - 22);
        const pulse = 0.55 + 0.45 * Math.sin(t * 9);
        const cx = Math.cos(a.heading);
        const cy = Math.sin(a.heading);
        g.fillStyle(color, pulse);
        g.fillTriangle(
          ex + cx * 11,
          ey + cy * 11,
          ex - cx * 7 - cy * 8,
          ey - cy * 7 + cx * 8,
          ex - cx * 7 + cy * 8,
          ey - cy * 7 - cx * 8,
        );
        g.lineStyle(2, color, pulse * 0.6);
        g.strokeCircle(ex, ey, 16);
      }

      if (a.fuelMax > 0) {
        // Fuel ring drains clockwise and turns red when it is nearly empty.
        const frac = Math.max(0, a.fuel / a.fuelMax);
        const low = frac < 0.3;
        const r = a.kind === 'heavy' ? 26 : 20;
        g.lineStyle(3, 0x0b1410, 0.45);
        g.strokeCircle(a.x, a.y, r);
        g.lineStyle(3, low ? 0xff3b30 : 0xffb020, low ? 0.6 + 0.4 * Math.sin(t * 12) : 0.95);
        g.beginPath();
        g.arc(a.x, a.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
        g.strokePath();
      }

      if (a.warn) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 14);
        g.lineStyle(2.5, 0xff3b30, 0.5 + pulse * 0.5);
        g.strokeCircle(a.x, a.y, KINDS[a.kind].radius + WARN_GAP / 2);
      }

      if (a === drag || (a === this.hover && !drag)) {
        g.lineStyle(2, 0xffffff, a === drag ? 0.9 : 0.5);
        g.strokeCircle(a.x, a.y, a.kind === 'heavy' ? 28 : 22);
      }
    }
  }
}

