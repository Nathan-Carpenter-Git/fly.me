import Phaser from 'phaser';
import { W, H, KINDS, Kind, GREEN } from './config';
import { Airport, Point, Runway, ThemeId } from './airport';

/** All textures are drawn at 2x and displayed at half scale to stay crisp. */
export const TEX_SCALE = 2;

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  const tex = scene.textures.createCanvas(key, w * TEX_SCALE, h * TEX_SCALE);
  if (!tex) throw new Error(`Could not create texture ${key}`);
  const c = tex.getContext();
  c.scale(TEX_SCALE, TEX_SCALE);
  draw(c);
  tex.refresh();
}

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Lighten (amt > 0) or darken (amt < 0) a color. */
function shade(color: number, amt: number) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const f = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function poly(c: Ctx, pts: number[][], mirror = false) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, mirror ? -y : y) : c.moveTo(x, mirror ? -y : y)));
  c.closePath();
  c.fill();
  c.stroke();
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, stroke = true) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  if (stroke) c.stroke();
}

function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

const OUTLINE = 'rgba(14,20,30,0.6)';

function prep(c: Ctx, x: number, y: number) {
  c.translate(x, y);
  c.lineJoin = 'round';
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.1;
}

function cockpit(c: Ctx, x: number, rx: number, ry: number) {
  c.fillStyle = '#1b2838';
  ellipse(c, x, 0, rx, ry, false);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  ellipse(c, x + rx * 0.3, -ry * 0.35, rx * 0.4, ry * 0.3, false);
}

function drawJet(c: Ctx, color: number) {
  prep(c, 30, 26);
  c.fillStyle = hex(color);
  const wing = [[6, -3], [-6, -23], [-11, -23], [-6, -3]];
  poly(c, wing);
  poly(c, wing, true);
  const stab = [[-15, -2], [-21, -10], [-24, -10], [-21, -2]];
  poly(c, stab);
  poly(c, stab, true);
  c.fillStyle = shade(color, -0.4);
  c.beginPath();
  c.roundRect(-4, -14, 8, 4, 1.5);
  c.roundRect(-4, 10, 8, 4, 1.5);
  c.fill();
  c.fillStyle = shade(color, 0.45);
  ellipse(c, 0, 0, 24, 4.6);
  c.fillStyle = hex(color);
  c.fillRect(-19, -0.8, 30, 1.6);
  cockpit(c, 16.5, 3.6, 2.5);
}

function drawHeavy(c: Ctx, color: number) {
  prep(c, 38, 35);
  c.fillStyle = hex(color);
  const wing = [[9, -4], [-9, -32], [-16, -32], [-9, -4]];
  poly(c, wing);
  poly(c, wing, true);
  const stab = [[-21, -3], [-29, -13], [-33, -13], [-29, -3]];
  poly(c, stab);
  poly(c, stab, true);
  c.fillStyle = shade(color, -0.4);
  c.beginPath();
  for (const s of [-1, 1]) {
    c.roundRect(-3, s * 14 - 2.4, 10, 4.8, 2);
    c.roundRect(-10, s * 24 - 2.2, 9, 4.4, 2);
  }
  c.fill();
  c.fillStyle = shade(color, 0.45);
  ellipse(c, 0, 0, 32, 6);
  c.fillStyle = hex(color);
  c.fillRect(-26, -1, 40, 2);
  cockpit(c, 23, 4.4, 3.2);
}

function drawProp(c: Ctx, color: number) {
  prep(c, 24, 23);
  c.fillStyle = hex(color);
  c.beginPath();
  c.roundRect(-4, -21, 9, 42, 3);
  c.fill();
  c.stroke();
  c.beginPath();
  c.roundRect(-18, -8, 5, 16, 2);
  c.fill();
  c.stroke();
  c.fillStyle = shade(color, 0.5);
  poly(c, [[17, -3], [17, 3], [-6, 3.4], [-18, 1.4], [-18, -1.4], [-6, -3.4]]);
  c.fillStyle = '#1b2838';
  ellipse(c, 6, 0, 4, 2.4, false);
  c.fillStyle = 'rgba(230,236,240,0.55)';
  ellipse(c, 19, 0, 1.1, 8, false);
  c.fillStyle = '#2a3340';
  ellipse(c, 18.3, 0, 1.6, 1.6, false);
}

function drawBizjet(c: Ctx, color: number) {
  prep(c, 26, 22);
  c.fillStyle = hex(color);
  const wing = [[4, -3], [-4, -19], [-8.5, -19], [-5, -3]];
  poly(c, wing);
  poly(c, wing, true);
  const stab = [[-16, -1], [-21, -9], [-23.5, -9], [-21, -1]];
  poly(c, stab);
  poly(c, stab, true);
  c.fillStyle = shade(color, 0.45);
  ellipse(c, 0, 0, 21, 3.8);
  c.fillStyle = shade(color, -0.35);
  ellipse(c, -12, -5.2, 5, 2.2);
  ellipse(c, -12, 5.2, 5, 2.2);
  c.fillStyle = hex(color);
  c.fillRect(-15, -0.7, 26, 1.4);
  cockpit(c, 15, 3.2, 2.2);
}

function drawHeli(c: Ctx, color: number) {
  prep(c, 24, 15);
  c.fillStyle = 'rgba(40,46,56,0.9)';
  c.fillRect(-7, -7.5, 17, 1.6);
  c.fillRect(-7, 5.9, 17, 1.6);
  c.fillStyle = shade(color, -0.25);
  c.beginPath();
  c.roundRect(-21, -1.7, 20, 3.4, 1.5);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(230,236,240,0.6)';
  c.fillRect(-22, -5.5, 1.6, 11);
  c.fillStyle = hex(color);
  ellipse(c, 2, 0, 10.5, 6.6);
  c.fillStyle = '#1b2838';
  ellipse(c, 7, 0, 4.6, 4.8, false);
  c.fillStyle = 'rgba(255,255,255,0.65)';
  ellipse(c, 8.2, -1.8, 1.6, 1, false);
}

function drawRotor(c: Ctx) {
  c.translate(21, 21);
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 20);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0.03)');
  c.fillStyle = g;
  ellipse(c, 0, 0, 20, 20, false);
  c.fillStyle = 'rgba(28,32,40,0.75)';
  c.beginPath();
  c.roundRect(-20, -1.3, 40, 2.6, 1.3);
  c.roundRect(-1.3, -20, 2.6, 40, 1.3);
  c.fill();
  c.fillStyle = '#c9d2dc';
  ellipse(c, 0, 0, 2.2, 2.2, false);
}

function drawCloud(c: Ctx, rng: () => number) {
  for (let i = 0; i < 9; i++) {
    const x = 50 + rng() * 140;
    const y = 50 + rng() * 40;
    const r = 30 + rng() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 240, 140);
  }
}

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ themes

interface Theme {
  base: string;
  fields: string[];
  fieldAlpha: number;
  furrow: string | null;
  trees: string[];
  treeHi: string;
  treeCount: number;
  grounds: string;
  water: [string, string];
  shore: string;
  road: [string, string];
  dunes?: boolean;
  overlay?: string;
}

const MEADOW: Theme = {
  base: '#5c8a4b',
  fields: ['#6a9a55', '#557d44', '#79a25b', '#8cab60', '#9fb168', '#5b8a52', '#6f9658'],
  fieldAlpha: 0.6,
  furrow: '#20301a',
  trees: ['#2f5e2c', '#386b32'],
  treeHi: 'rgba(160,210,120,0.25)',
  treeCount: 40,
  grounds: 'rgba(140,190,110,0.35)',
  water: ['#2d6a93', '#4b8db5'],
  shore: '#d3cb9c',
  road: ['#7b7b70', '#a9a89a'],
};

const THEMES: Record<ThemeId, Theme> = {
  meadow: MEADOW,
  lakeside: { ...MEADOW, base: '#5a8f55', fields: ['#679c5c', '#5a8a4e', '#78a865', '#6f9a5a', '#86ad66'] },
  autumn: {
    ...MEADOW,
    base: '#7c8a4c',
    fields: ['#a7893f', '#8f7a3a', '#b69a4c', '#6f8445', '#c2a25a', '#8c6a35', '#7d8f4c'],
    furrow: '#3a2a12',
    trees: ['#b4582a', '#c98a2f', '#8a4a22', '#4e6b2e'],
    treeHi: 'rgba(255,220,150,0.25)',
    grounds: 'rgba(190,190,120,0.3)',
  },
  winter: {
    base: '#c6d2da',
    fields: ['#d6dfe5', '#bcc9d2', '#cdd8df', '#e0e7ec', '#b4c2cc'],
    fieldAlpha: 0.7,
    furrow: '#6e7f8c',
    trees: ['#24443a', '#1d3a31', '#2c4f43'],
    treeHi: 'rgba(255,255,255,0.65)',
    treeCount: 48,
    grounds: 'rgba(235,242,246,0.45)',
    water: ['#9dbfd3', '#c4dae7'],
    shore: '#aebbc4',
    road: ['#7f8992', '#a5aeb6'],
  },
  coast: { ...MEADOW, base: '#5f9150', shore: '#e3d6a4' },
  desert: {
    base: '#c9a36b',
    fields: ['#c19a62', '#d3b07a', '#b98f58', '#cfa872', '#ba915f'],
    fieldAlpha: 0.55,
    furrow: null,
    trees: ['#5e7a3a', '#6f8a45', '#4f6a33'],
    treeHi: 'rgba(220,240,160,0.25)',
    treeCount: 16,
    grounds: 'rgba(120,100,70,0.22)',
    water: ['#2a7f86', '#45a3a5'],
    shore: '#e6d3a2',
    road: ['#8f7b5c', '#ab977a'],
    dunes: true,
  },
  dusk: {
    ...MEADOW,
    base: '#4f7a45',
    overlay: 'rgba(22,26,70,0.42)',
    grounds: 'rgba(140,190,110,0.16)',
  },
};

// ------------------------------------------------------------------ background

function bezier(flat: number[], steps = 24): Point[] {
  const pts: Point[] = [];
  for (let i = 2; i + 5 < flat.length; i += 6) {
    const [x0, y0] = [flat[i - 2], flat[i - 1]];
    const [c1x, c1y, c2x, c2y, x1, y1] = flat.slice(i, i + 6);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      pts.push({
        x: u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
        y: u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1,
      });
    }
  }
  return pts;
}

function bezierPath(c: Ctx, flat: number[]) {
  c.beginPath();
  c.moveTo(flat[0], flat[1]);
  for (let i = 2; i + 5 < flat.length; i += 6) {
    c.bezierCurveTo(flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 4], flat[i + 5]);
  }
}

function blob(c: Ctx, cx: number, cy: number, r: number, wobble: number, rng: () => number, n = 14) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wobble / 2 + rng() * wobble);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.75]);
  }
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x0, y0] = pts[i % n];
    const [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) c.moveTo(mx, my);
    else c.quadraticCurveTo(x0, y0, mx, my);
  }
  c.closePath();
}

function line(c: Ctx, pts: Point[]) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
}

function drawTaxiway(c: Ctx, pts: Point[]) {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  for (const [col, w] of [['#6f747b', 11], ['#4a4f56', 9]] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    line(c, pts);
    c.stroke();
  }
}

function drawTaxiCenter(c: Ctx, pts: Point[]) {
  c.strokeStyle = 'rgba(255,214,70,0.8)';
  c.lineWidth = 0.8;
  line(c, pts);
  c.stroke();
}

function runwayTaxiways(rw: Runway): Point[][] {
  const [e0c, e0t] = rw.exit(0);
  const [e1c, e1t] = rw.exit(1);
  return [
    [rw.taxi(0), rw.taxi(rw.length)],
    [rw.center(0), rw.taxi(0)],
    [rw.center(rw.length), rw.taxi(rw.length)],
    [rw.center(e0c), rw.taxi(e0t)],
    [rw.center(e1c), rw.taxi(e1t)],
  ];
}

function drawRunway(c: Ctx, rw: Runway, colorCss: string) {
  const L = rw.length;
  const w = rw.width;
  c.save();
  c.translate(rw.ax, rw.ay);
  c.rotate(Math.atan2(rw.uy, rw.ux));
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.fillRect(-12, -w / 2 - 2, L + 26, w + 8);
  c.fillStyle = '#7c8189';
  c.fillRect(-14, -w / 2 - 3, L + 28, w + 6);
  c.fillStyle = '#3a3e45';
  c.fillRect(-10, -w / 2, L + 20, w);
  const rng = mulberry32(Math.round(rw.ax * 13 + rw.ay));
  for (let i = 0; i < L * 1.5; i++) {
    c.fillStyle = `rgba(255,255,255,${0.02 + rng() * 0.03})`;
    c.fillRect(-10 + rng() * (L + 20), -w / 2 + rng() * w, 1.2, 1.2);
  }
  // Tyre marks in both touchdown zones.
  c.fillStyle = 'rgba(15,15,18,0.35)';
  for (const x of [30, L - 80]) {
    c.fillRect(x, -w / 2 + w * 0.3, 50, 2.2);
    c.fillRect(x, w / 2 - w * 0.3 - 2.2, 50, 2.2);
  }
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fillRect(-10, -w / 2 + 1.2, L + 20, 1);
  c.fillRect(-10, w / 2 - 2.2, L + 20, 1);
  const keys = w > 18 ? 6 : 4;
  const span = w - 6;
  for (let i = 0; i < keys; i++) {
    const y = -span / 2 + (i + 0.5) * (span / keys) - 0.9;
    c.fillRect(3, y, 12, 1.8);
    c.fillRect(L - 15, y, 12, 1.8);
  }
  for (let x = 40; x < L - 40; x += 15) c.fillRect(x, -0.6, 8, 1.2);
  c.font = `700 ${w > 18 ? 11 : 8}px Rubik, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.save();
  c.translate(26, 0);
  c.rotate(Math.PI / 2);
  c.fillText(rw.labels[0], 0, 0);
  c.restore();
  c.save();
  c.translate(L - 26, 0);
  c.rotate(-Math.PI / 2);
  c.fillText(rw.labels[1], 0, 0);
  c.restore();
  c.fillStyle = colorCss;
  c.fillRect(-10, -w / 2, 3, w);
  c.fillRect(L + 7, -w / 2, 3, w);
  for (let x = -6; x <= L + 8; x += 18) {
    for (const y of [-w / 2 - 1.5, w / 2 + 1.5]) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      circle(c, x, y, 1.9);
      c.fillStyle = colorCss;
      circle(c, x, y, 1.3);
    }
  }
  c.restore();
}

function drawHelipad(c: Ctx, p: Point) {
  c.save();
  c.translate(p.x, p.y);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  circle(c, 2, 3, 27);
  c.fillStyle = '#7c8189';
  circle(c, 0, 0, 27);
  c.fillStyle = '#3d4249';
  circle(c, 0, 0, 24);
  c.strokeStyle = KINDS.heli.css;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, 19, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.font = '800 20px Rubik, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('H', 0, 1);
  c.restore();
}

function drawApron(c: Ctx, airport: Airport) {
  const ap = airport.def.apron;
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath();
  c.roundRect(ap.x + 3, ap.y + 4, ap.w, ap.h, 5);
  c.fill();
  c.fillStyle = '#8a8f96';
  c.beginPath();
  c.roundRect(ap.x, ap.y, ap.w, ap.h, 5);
  c.fill();
  // Concrete slab seams.
  c.strokeStyle = 'rgba(0,0,0,0.08)';
  c.lineWidth = 1;
  for (let x = ap.x + 24; x < ap.x + ap.w; x += 24) {
    c.beginPath();
    c.moveTo(x, ap.y);
    c.lineTo(x, ap.y + ap.h);
    c.stroke();
  }
  // Stand lead-in lines.
  c.strokeStyle = 'rgba(255,214,70,0.75)';
  c.lineWidth = 0.9;
  for (const s of airport.stands) {
    c.beginPath();
    c.moveTo(s.x, s.y - Math.sin(s.heading) * 10);
    c.lineTo(s.pushX, s.pushY + Math.sin(s.heading) * 8);
    c.stroke();
    c.beginPath();
    c.moveTo(s.x - 6, s.y - Math.sin(s.heading) * 10);
    c.lineTo(s.x + 6, s.y - Math.sin(s.heading) * 10);
    c.stroke();
  }
  // Terminal building.
  const ty = ap.terminal === 'bottom' ? ap.y + ap.h - 26 : ap.y + 2;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(ap.x + 16, ty + 4, ap.w - 24, 24);
  c.fillStyle = '#d8dde3';
  c.fillRect(ap.x + 12, ty, ap.w - 24, 24);
  c.fillStyle = '#b9c0c8';
  for (let x = ap.x + 20; x < ap.x + ap.w - 18; x += 14) c.fillRect(x, ty + 4, 8, 16);
  c.fillStyle = '#5fa8d3';
  c.fillRect(ap.x + 12, ap.terminal === 'bottom' ? ty - 2 : ty + 23, ap.w - 24, 2.5);
}

function drawTower(c: Ctx, [x, y]: [number, number]) {
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(x - 6, y - 6, 26, 26);
  c.fillStyle = '#c3c9d0';
  c.fillRect(x - 11, y - 11, 22, 22);
  c.fillStyle = '#e8ecf0';
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    c.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
  }
  c.closePath();
  c.fill();
  c.fillStyle = '#3d7ea6';
  circle(c, x, y, 4.5);
}

function drawBackground(c: Ctx, airport: Airport) {
  const def = airport.def;
  const theme = THEMES[def.theme];
  const rng = mulberry32(def.seed);
  const t = def.terrain;

  c.fillStyle = theme.base;
  c.fillRect(0, 0, W, H);

  for (let i = 0; i < 90; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const fw = 70 + rng() * 150;
    const fh = 50 + rng() * 110;
    c.save();
    c.translate(x, y);
    c.rotate((rng() - 0.5) * 0.3);
    c.fillStyle = theme.fields[Math.floor(rng() * theme.fields.length)];
    c.globalAlpha = theme.fieldAlpha;
    if (theme.dunes) {
      c.beginPath();
      c.ellipse(0, 0, fw / 2, fh / 2, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillRect(-fw / 2, -fh / 2, fw, fh);
    }
    if (theme.furrow) {
      c.globalAlpha = 0.12;
      c.fillStyle = theme.furrow;
      for (let s = -fh / 2 + 4; s < fh / 2; s += 6) c.fillRect(-fw / 2, s, fw, 1);
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(40,60,30,0.25)';
      c.lineWidth = 1;
      c.strokeRect(-fw / 2, -fh / 2, fw, fh);
    }
    c.globalAlpha = 1;
    c.restore();
  }

  if (theme.dunes) {
    for (let i = 0; i < 26; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const len = 60 + rng() * 120;
      c.lineCap = 'round';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(120,80,40,0.18)';
      c.beginPath();
      c.moveTo(x, y + 2);
      c.quadraticCurveTo(x + len / 2, y - 18 + 2, x + len, y + 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,240,210,0.25)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + len / 2, y - 18, x + len, y);
      c.stroke();
    }
  }

  // Water.
  if (t.sea) {
    const d = t.sea.depth;
    const shoreline = (inset: number) => {
      c.beginPath();
      c.moveTo(-10, -10);
      for (let y = -10; y <= H + 10; y += 30) {
        c.lineTo(d - inset + Math.sin(y / 70) * 18 + Math.sin(y / 23) * 5, y);
      }
      c.lineTo(-10, H + 10);
      c.closePath();
    };
    c.fillStyle = theme.shore;
    shoreline(-14);
    c.fill();
    const g = c.createLinearGradient(0, 0, d, 0);
    g.addColorStop(0, '#1f557c');
    g.addColorStop(1, '#4b95bd');
    c.fillStyle = g;
    shoreline(0);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 30; i++) {
      const x = rng() * (d - 40);
      const y = rng() * H;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 8, y - 3, x + 16, y);
      c.stroke();
    }
  }
  if (t.river) {
    c.lineCap = 'round';
    const passes: [string, number][] = [
      [theme.shore, 24],
      [theme.water[1], 17],
      ['rgba(255,255,255,0.12)', 4],
    ];
    for (const [col, w] of passes) {
      c.strokeStyle = col;
      c.lineWidth = w;
      bezierPath(c, t.river);
      c.stroke();
    }
  }
  if (t.lake) {
    const { x, y, r } = t.lake;
    c.fillStyle = theme.shore;
    blob(c, x, y, r, 0.35, mulberry32(def.seed + 3));
    c.fill();
    const lake = c.createRadialGradient(x, y, 20, x, y, r);
    lake.addColorStop(0, theme.water[0]);
    lake.addColorStop(1, theme.water[1]);
    c.fillStyle = lake;
    blob(c, x, y + 2, r - 12, 0.35, mulberry32(def.seed + 3));
    c.fill();
  }

  for (const road of t.roads) {
    c.lineCap = 'round';
    c.strokeStyle = theme.road[0];
    c.lineWidth = 9;
    bezierPath(c, road);
    c.stroke();
    c.strokeStyle = theme.road[1];
    c.lineWidth = 7;
    bezierPath(c, road);
    c.stroke();
    c.setLineDash([6, 8]);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1;
    bezierPath(c, road);
    c.stroke();
    c.setLineDash([]);
  }

  // Trees, kept off the airport, the water and the roads.
  const [gx, gy, gw, gh] = def.grounds;
  const avoid: Point[] = [...(t.river ? bezier(t.river) : []), ...t.roads.flatMap((r) => bezier(r))];
  const blocked = (x: number, y: number) =>
    (x > gx - 12 && x < gx + gw + 12 && y > gy - 12 && y < gy + gh + 12) ||
    (t.lake && Math.hypot(x - t.lake.x, (y - t.lake.y) / 0.75) < t.lake.r + 14) ||
    (t.sea && x < t.sea.depth + 36) ||
    avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 18);
  for (let i = 0; i < theme.treeCount; i++) {
    const cx = rng() * W;
    const cy = rng() * H;
    const n = 4 + Math.floor(rng() * 10);
    for (let j = 0; j < n; j++) {
      const x = cx + (rng() - 0.5) * 60;
      const y = cy + (rng() - 0.5) * 40;
      const r = (theme.dunes ? 3 : 4) + rng() * (theme.dunes ? 3 : 5);
      const col = theme.trees[Math.floor(rng() * theme.trees.length)];
      if (blocked(x, y)) continue;
      c.fillStyle = 'rgba(15,35,15,0.35)';
      circle(c, x + 3, y + 4, r);
      c.fillStyle = col;
      circle(c, x, y, r);
      c.fillStyle = theme.treeHi;
      circle(c, x - r * 0.3, y - r * 0.3, r * 0.5);
    }
  }

  if (theme.overlay) {
    c.fillStyle = theme.overlay;
    c.fillRect(0, 0, W, H);
  }

  // Airport.
  c.fillStyle = theme.grounds;
  c.beginPath();
  c.roundRect(gx, gy, gw, gh, 40);
  c.fill();
  c.strokeStyle = 'rgba(230,230,220,0.35)';
  c.setLineDash([3, 4]);
  c.lineWidth = 1;
  c.stroke();
  c.setLineDash([]);

  const taxiways: Point[][] = [
    ...airport.runways.flatMap(runwayTaxiways),
    ...airport.mouths.map((m) => [{ x: m.x, y: m.y }, airport.runways[m.runway].taxi(m.q)]),
    ...def.links.map((l) => l.map(([x, y]) => ({ x, y }))),
  ];
  for (const tw of taxiways) drawTaxiway(c, tw);
  for (const tw of taxiways) drawTaxiCenter(c, tw);

  // Hold-short bars at the runway end connectors.
  c.fillStyle = 'rgba(255,214,70,0.95)';
  for (const rw of airport.runways) {
    for (const e of [0, 1] as const) {
      const h = rw.hold(e);
      c.save();
      c.translate(h.x, h.y);
      c.rotate(Math.atan2(rw.uy, rw.ux));
      c.fillRect(-4.5, -1.6, 9, 1);
      c.fillRect(-4.5, 0.6, 9, 1);
      c.restore();
    }
  }

  drawApron(c, airport);
  for (const rw of airport.runways) drawRunway(c, rw, rw.size === 'long' ? KINDS.jet.css : KINDS.prop.css);
  for (const p of airport.pads) drawHelipad(c, p);
  drawTower(c, def.tower);

  const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,10,5,0.45)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}

export function createBackground(scene: Phaser.Scene, key: string, airport: Airport) {
  if (!scene.textures.exists(key)) make(scene, key, W, H, (c) => drawBackground(c, airport));
}

export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('rotor')) return;
  const drawers: Record<Kind, [number, number, (c: Ctx, color: number) => void]> = {
    jet: [60, 52, drawJet],
    heavy: [76, 70, drawHeavy],
    prop: [48, 46, drawProp],
    heli: [48, 30, drawHeli],
    transit: [52, 44, drawBizjet],
    depart: [60, 52, drawJet],
  };
  for (const kind of Object.keys(KINDS) as Kind[]) {
    const [w, h, draw] = drawers[kind];
    make(scene, `ac-${kind}`, w, h, (c) => draw(c, kind === 'depart' ? GREEN : KINDS[kind].color));
  }
  make(scene, 'rotor', 42, 42, drawRotor);
  make(scene, 'icon-fast', 76, 52, (c) => {
    c.save();
    c.translate(16, 0);
    drawJet(c, KINDS.jet.color);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineCap = 'round';
    c.lineWidth = 4.5;
    for (const [y, x0] of [[26, 1], [13, 7], [39, 7]]) {
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(20, y);
      c.stroke();
    }
  });
  make(scene, 'icon-wind', 48, 48, (c) => {
    c.strokeStyle = '#e8f0ea';
    c.lineCap = 'round';
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(5, 15);
    c.lineTo(30, 15);
    c.quadraticCurveTo(39, 15, 39, 9);
    c.quadraticCurveTo(39, 3, 33, 4);
    c.stroke();
    c.beginPath();
    c.moveTo(5, 25);
    c.lineTo(36, 25);
    c.quadraticCurveTo(44, 25, 44, 32);
    c.quadraticCurveTo(44, 39, 37, 38);
    c.stroke();
    c.beginPath();
    c.moveTo(9, 35);
    c.lineTo(24, 35);
    c.stroke();
  });
  const rng = mulberry32(9);
  for (let i = 0; i < 3; i++) make(scene, `cloud${i}`, 240, 140, (c) => drawCloud(c, rng));
}
