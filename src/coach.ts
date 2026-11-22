import Phaser from 'phaser';
import { W, H, ZOOM, FONT } from './config';
import { Point } from './airport';

export interface CoachMsg {
  key: string;
  kicker: string;
  title: string;
  text: string;
  color: string;
  focus?: { x: number; y: number; r: number };
  /** Extra areas to light up, such as the destination of the demo route. */
  spots?: { x: number; y: number; r: number }[];
  /** Optional demo route drawn as animated dots. */
  ghost?: Point[];
}

const CARD_W = 390;

/** Contextual tutorial: dims the world, spotlights one thing, explains it, waits for a click. */
export class Coach {
  private g: Phaser.GameObjects.Graphics;
  private dim: Phaser.GameObjects.Image;
  private dimTex: Phaser.Textures.CanvasTexture;
  private card: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private kicker: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private prompt: Phaser.GameObjects.Text;
  private queue: CoachMsg[] = [];
  private current: CoachMsg | null = null;
  private shownAt = 0;

  constructor(private scene: Phaser.Scene) {
    // The dim layer is a low-res canvas with soft holes punched out, scaled up to the world.
    this.dimTex = scene.textures.createCanvas('coach-dim', W / 2, H / 2)!;
    this.dim = scene.add.image(0, 0, 'coach-dim').setOrigin(0).setScale(2).setDepth(150).setVisible(false);
    this.g = scene.add.graphics().setDepth(150);
    const text = (size: number, color: string, weight: number) =>
      scene.add.text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: String(weight),
        color,
        resolution: ZOOM * 2,
        wordWrap: { width: CARD_W - 40 },
        lineSpacing: 5,
      });
    this.bg = scene.add.graphics();
    this.kicker = text(12, '#ffffff', 700).setLetterSpacing(2);
    this.title = text(24, '#ffffff', 800);
    this.body = text(15, '#cfe0d6', 500);
    this.prompt = text(12, '#a9c4b4', 700).setLetterSpacing(1);
    this.card = scene.add
      .container(0, 0, [this.bg, this.kicker, this.title, this.body, this.prompt])
      .setDepth(151)
      .setVisible(false);
  }

  get visible() {
    return this.current !== null;
  }

  show(msg: CoachMsg) {
    if (this.current) {
      this.queue.push(msg);
      return;
    }
    this.current = msg;
    this.shownAt = this.scene.time.now;
    this.kicker.setText(msg.kicker).setColor(msg.color).setPosition(20, 18);
    this.title.setText(msg.title).setPosition(20, 36);
    this.body.setText(msg.text).setPosition(20, 36 + this.title.height + 6);
    const promptY = this.body.y + this.body.height + 14;
    this.prompt.setText('CLICK TO CONTINUE').setPosition(20, promptY);
    const h = promptY + 32;
    this.bg.clear();
    this.bg.fillStyle(0x0f1d16, 0.96);
    this.bg.fillRoundedRect(0, 0, CARD_W, h, 16);
    this.bg.lineStyle(2, Phaser.Display.Color.HexStringToColor(msg.color).color, 0.6);
    this.bg.strokeRoundedRect(0, 0, CARD_W, h, 16);

    const [x, y] = this.place(msg, h);
    this.paintDim(msg);
    this.card.setPosition(x, y).setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.card, alpha: 1, duration: 180 });
  }

  /** Picks the card position that covers the least of the spotlight, spots and demo route. */
  private place(msg: CoachMsg, h: number): [number, number] {
    const f = msg.focus;
    if (!f) return [W / 2 - CARD_W / 2, H / 2 - h / 2];
    const minY = 84;
    const maxY = H - h - 56;
    const cx = (x: number) => Phaser.Math.Clamp(x, 20, W - CARD_W - 20);
    const cy = (y: number) => Phaser.Math.Clamp(y, minY, maxY);
    const candidates: [number, number][] = [
      [cx(f.x - CARD_W / 2), cy(f.y + f.r + 18)],
      [cx(f.x - CARD_W / 2), cy(f.y - f.r - 18 - h)],
      [cx(f.x + f.r + 18), cy(f.y - h / 2)],
      [cx(f.x - f.r - 18 - CARD_W), cy(f.y - h / 2)],
      [20, minY],
      [W - CARD_W - 20, minY],
      [20, maxY],
      [W - CARD_W - 20, maxY],
    ];
    const circles = [f, ...(msg.spots ?? [])];
    const samples: Point[] = [];
    const ghost = msg.ghost ?? [];
    for (let i = 1; i < ghost.length; i++) {
      for (let k = 0; k <= 10; k++) {
        samples.push({
          x: ghost[i - 1].x + ((ghost[i].x - ghost[i - 1].x) * k) / 10,
          y: ghost[i - 1].y + ((ghost[i].y - ghost[i - 1].y) * k) / 10,
        });
      }
    }
    const score = ([x, y]: [number, number]) => {
      let s = 0;
      for (const c of circles) {
        const nx = Phaser.Math.Clamp(c.x, x, x + CARD_W);
        const ny = Phaser.Math.Clamp(c.y, y, y + h);
        const d = Math.hypot(c.x - nx, c.y - ny);
        if (d < c.r + 8) s += 100 * (c.r + 8 - d);
      }
      for (const p of samples) if (p.x > x - 8 && p.x < x + CARD_W + 8 && p.y > y - 8 && p.y < y + h + 8) s += 50;
      // Prefer staying near the focus when everything else is equal.
      s += Math.hypot(x + CARD_W / 2 - f.x, y + h / 2 - f.y) * 0.01;
      return s;
    };
    return candidates.reduce((best, c) => (score(c) < score(best) ? c : best));
  }

  private paintDim(msg: CoachMsg) {
    const c = this.dimTex.getContext();
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W / 2, H / 2);
    c.fillStyle = 'rgba(6,16,11,0.62)';
    c.fillRect(0, 0, W / 2, H / 2);
    c.globalCompositeOperation = 'destination-out';
    for (const s of [msg.focus, ...(msg.spots ?? [])]) {
      if (!s) continue;
      const x = s.x / 2;
      const y = s.y / 2;
      const r = s.r / 2;
      const g = c.createRadialGradient(x, y, r * 0.85, x, y, r + 6);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r - 8, y - r - 8, (r + 8) * 2, (r + 8) * 2);
    }
    c.globalCompositeOperation = 'source-over';
    this.dimTex.refresh();
    this.dim.setVisible(true);
  }

  /** Returns true if a message was dismissed. */
  dismiss() {
    if (!this.current) return false;
    if (this.scene.time.now - this.shownAt < 350) return true;
    this.current = null;
    this.card.setVisible(false);
    this.dim.setVisible(false);
    this.g.clear();
    const next = this.queue.shift();
    if (next) this.show(next);
    return true;
  }

  clear() {
    this.queue = [];
    this.current = null;
    this.card.setVisible(false);
    this.dim.setVisible(false);
    this.g.clear();
  }

  draw() {
    const msg = this.current;
    const g = this.g;
    g.clear();
    if (!msg) return;
    const t = this.scene.time.now / 1000;
    const f = msg.focus;
    if (f) {
      g.lineStyle(2, 0xffffff, 0.55 + 0.25 * Math.sin(t * 5));
      g.strokeCircle(f.x, f.y, f.r);
    }
    for (const s of msg.spots ?? []) {
      g.lineStyle(2, 0xffffff, 0.3);
      g.strokeCircle(s.x, s.y, s.r);
    }
    if (msg.ghost && msg.ghost.length > 1) {
      const color = Phaser.Display.Color.HexStringToColor(msg.color).color;
      const pts = msg.ghost;
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      // The route "draws itself" over 1.6 seconds, then holds and loops.
      const progress = Math.min(1, ((t % 2.4) / 1.6)) * total;
      let walked = 0;
      let tip = pts[0];
      g.fillStyle(color, 0.95);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = (8 - (walked % 8)) % 8; d < seg; d += 8) {
          if (walked + d > progress) break;
          const k = d / seg;
          tip = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          g.fillCircle(tip.x, tip.y, 2.2);
        }
        walked += seg;
      }
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(tip.x, tip.y, 5);
      g.lineStyle(2, color, 1);
      g.strokeCircle(tip.x, tip.y, 8);
    }
  }
}
