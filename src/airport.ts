import { W, H } from './config';

export interface Point {
  x: number;
  y: number;
}

export type ThemeId = 'meadow' | 'autumn' | 'winter' | 'coast' | 'desert' | 'lakeside' | 'dusk';
export type Edge = 'top' | 'right' | 'bottom' | 'left';

export interface RunwayDef {
  size: 'long' | 'short';
  a: [number, number];
  b: [number, number];
  /** Which side of the runway the parallel taxiway is on. */
  side: 1 | -1;
}

export interface ApronDef {
  x: number;
  y: number;
  w: number;
  h: number;
  terminal: 'top' | 'bottom';
  /** Where taxiways leave the apron, and which runway each one serves. */
  mouths: { x: number; y: number; runway: number }[];
}

export interface GateDef {
  id: string;
  edge: Edge;
  at: number;
}

export interface TerrainDef {
  lake?: { x: number; y: number; r: number };
  /** Cubic bezier chain: x0,y0 then (c1x,c1y,c2x,c2y,x,y) per segment. */
  river?: number[];
  sea?: { side: Edge; depth: number };
  roads: number[][];
}

/** Outline of a slot that can be built later, drawn as survey markings on the map. */
export type Plot =
  | { id: string; kind: 'runway'; a: [number, number]; b: [number, number]; width: number }
  | { id: string; kind: 'pad'; x: number; y: number }
  | { id: string; kind: 'rect'; x: number; y: number; w: number; h: number };

export interface LayoutDef {
  name: string;
  theme: ThemeId;
  seed: number;
  runways: RunwayDef[];
  pads: [number, number][];
  apron: ApronDef;
  tower: [number, number];
  gates: GateDef[];
  grounds: [number, number, number, number];
  /** Extra decorative taxiways. */
  links: [number, number][][];
  terrain: TerrainDef;
  plots?: Plot[];
  /** Where landing aircraft turn off the runway, as a fraction of its length. */
  exitFrac?: number;
}

export const LAYOUTS: LayoutDef[] = [
  {
    name: 'Meadow Field',
    theme: 'meadow',
    seed: 42,
    runways: [
      { size: 'long', a: [430, 430], b: [770, 430], side: 1 },
      { size: 'short', a: [520, 212], b: [694, 290], side: 1 },
    ],
    pads: [[905, 505]],
    apron: { x: 540, y: 486, w: 250, h: 74, terminal: 'bottom', mouths: [{ x: 700, y: 486, runway: 0 }] },
    tower: [824, 540],
    gates: [
      { id: 'A', edge: 'right', at: 300 },
      { id: 'B', edge: 'top', at: 1010 },
    ],
    grounds: [380, 165, 590, 420],
    links: [
      [[682, 316], [682, 461]],
      [[790, 515], [880, 507]],
    ],
    terrain: {
      lake: { x: 170, y: 610, r: 150 },
      river: [1010, -20, 1060, 120, 1150, 160, 1170, 280, 1190, 400, 1230, 460, 1300, 520],
      roads: [
        [-10, 110, 300, 60, 700, 140, 1290, 70],
        [665, 730, 665, 650, 665, 600, 665, 560],
      ],
    },
  },
  {
    name: 'Harvest Valley',
    theme: 'autumn',
    seed: 7,
    runways: [
      { size: 'long', a: [430, 560], b: [724, 390], side: 1 },
      { size: 'short', a: [770, 205], b: [570, 205], side: -1 },
    ],
    pads: [
      [330, 330],
      [950, 300],
    ],
    apron: { x: 700, y: 470, w: 220, h: 74, terminal: 'bottom', mouths: [{ x: 740, y: 470, runway: 0 }] },
    tower: [950, 520],
    gates: [
      { id: 'A', edge: 'left', at: 230 },
      { id: 'B', edge: 'top', at: 1050 },
    ],
    grounds: [290, 150, 700, 470],
    links: [[[770, 233], [880, 233], [928, 284]]],
    terrain: {
      river: [250, -20, 200, 150, 110, 250, 140, 400, 170, 550, 60, 620, -20, 700],
      roads: [
        [-10, 90, 400, 120, 800, 60, 1290, 110],
        [810, 730, 810, 650, 810, 600, 810, 546],
      ],
    },
  },
  {
    name: 'Pine Ridge',
    theme: 'winter',
    seed: 99,
    runways: [
      { size: 'long', a: [400, 300], b: [800, 300], side: 1 },
      { size: 'short', a: [960, 170], b: [960, 370], side: -1 },
    ],
    pads: [[330, 520]],
    apron: { x: 480, y: 370, w: 280, h: 74, terminal: 'bottom', mouths: [{ x: 620, y: 370, runway: 0 }] },
    tower: [800, 420],
    gates: [
      { id: 'A', edge: 'right', at: 540 },
      { id: 'B', edge: 'top', at: 330 },
    ],
    grounds: [290, 130, 760, 450],
    links: [[[800, 331], [988, 331]]],
    terrain: {
      lake: { x: 1080, y: 620, r: 120 },
      roads: [
        [-10, 610, 300, 650, 700, 560, 1290, 440],
        [620, 730, 620, 620, 620, 520, 620, 446],
      ],
    },
  },
  {
    name: 'Seaside Strip',
    theme: 'coast',
    seed: 5,
    runways: [
      { size: 'long', a: [420, 480], b: [755, 421], side: -1 },
      { size: 'short', a: [880, 250], b: [1010, 370], side: 1 },
    ],
    pads: [[330, 240]],
    apron: { x: 520, y: 290, w: 260, h: 74, terminal: 'top', mouths: [{ x: 680, y: 364, runway: 0 }] },
    tower: [470, 330],
    gates: [
      { id: 'A', edge: 'right', at: 600 },
      { id: 'B', edge: 'top', at: 1000 },
    ],
    grounds: [290, 170, 760, 420],
    links: [[[780, 340], [890, 300]]],
    terrain: {
      sea: { side: 'left', depth: 190 },
      roads: [
        [600, -10, 600, 100, 610, 200, 620, 290],
        [250, -10, 290, 200, 260, 450, 300, 730],
      ],
    },
  },
  {
    name: 'Dune Strip',
    theme: 'desert',
    seed: 23,
    runways: [
      { size: 'long', a: [420, 250], b: [780, 250], side: 1 },
      { size: 'short', a: [470, 480], b: [690, 480], side: -1 },
    ],
    pads: [[920, 400]],
    apron: { x: 520, y: 312, w: 240, h: 74, terminal: 'bottom', mouths: [{ x: 700, y: 312, runway: 0 }] },
    tower: [800, 372],
    gates: [
      { id: 'A', edge: 'left', at: 330 },
      { id: 'B', edge: 'bottom', at: 1000 },
    ],
    grounds: [350, 165, 660, 390],
    links: [[[640, 452], [640, 386]]],
    terrain: {
      lake: { x: 190, y: 590, r: 80 },
      roads: [
        [-10, 140, 150, 150, 300, 120, 1290, 140],
        [900, 730, 950, 600, 1100, 520, 1290, 500],
        [-10, 420, 200, 400, 400, 376, 518, 374],
      ],
    },
  },
  {
    name: 'Lakeside',
    theme: 'lakeside',
    seed: 314,
    runways: [
      { size: 'long', a: [380, 300], b: [728, 393], side: -1 },
      { size: 'short', a: [900, 560], b: [1061, 480], side: 1 },
    ],
    pads: [[965, 255]],
    apron: { x: 560, y: 220, w: 250, h: 74, terminal: 'top', mouths: [{ x: 700, y: 294, runway: 0 }] },
    tower: [862, 304],
    gates: [
      { id: 'A', edge: 'right', at: 340 },
      { id: 'B', edge: 'bottom', at: 760 },
    ],
    grounds: [300, 165, 820, 450],
    links: [[[810, 260], [940, 255]]],
    terrain: {
      lake: { x: 170, y: 570, r: 190 },
      roads: [
        [-10, 120, 300, 90, 700, 150, 1290, 100],
        [650, 125, 650, 160, 650, 190, 650, 222],
      ],
    },
  },
  {
    name: 'Metro International',
    theme: 'dusk',
    seed: 77,
    runways: [
      { size: 'long', a: [400, 200], b: [780, 200], side: 1 },
      { size: 'long', a: [830, 520], b: [450, 520], side: 1 },
      { size: 'short', a: [930, 290], b: [1070, 410], side: -1 },
    ],
    pads: [
      [300, 380],
      [990, 600],
    ],
    apron: {
      x: 520,
      y: 300,
      w: 280,
      h: 110,
      terminal: 'top',
      mouths: [
        { x: 520, y: 360, runway: 0 },
        { x: 780, y: 410, runway: 1 },
      ],
    },
    tower: [850, 370],
    gates: [
      { id: 'A', edge: 'top', at: 1060 },
      { id: 'B', edge: 'left', at: 560 },
    ],
    grounds: [260, 140, 880, 520],
    links: [[[800, 330], [948, 269]]],
    terrain: {
      river: [-20, 300, 80, 280, 160, 240, 200, 120, 220, 40, 230, 0, 240, -20],
      roads: [
        [-10, 660, 300, 690, 700, 640, 1290, 680],
        [640, 730, 640, 690, 640, 600, 640, 560],
      ],
    },
  },
];

const TAXI_GAP = 20;
/** Where landing aircraft turn off the runway, as a fraction of its length. */
export const EXIT_FRAC = 0.5;

export class Runway {
  readonly size: 'long' | 'short';
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly length: number;
  readonly ux: number;
  readonly uy: number;
  /** Unit normal pointing toward the parallel taxiway. */
  readonly nx: number;
  readonly ny: number;
  readonly width: number;
  readonly taxiOff: number;
  readonly labels: [string, string];
  readonly exitFrac: number;
  /** 0: aircraft land at A heading toward B. 1: the reverse. */
  active: 0 | 1 = 0;
  /** Aircraft currently on the runway surface. */
  readonly ground = new Set<object>();

  constructor(def: RunwayDef, exitFrac = EXIT_FRAC) {
    this.exitFrac = exitFrac;
    this.size = def.size;
    [this.ax, this.ay] = def.a;
    [this.bx, this.by] = def.b;
    this.length = Math.hypot(this.bx - this.ax, this.by - this.ay);
    this.ux = (this.bx - this.ax) / this.length;
    this.uy = (this.by - this.ay) / this.length;
    this.nx = -this.uy * def.side;
    this.ny = this.ux * def.side;
    this.width = def.size === 'long' ? 22 : 16;
    this.taxiOff = this.width / 2 + TAXI_GAP;
    const num = (ang: number) => {
      const compass = ((((ang * 180) / Math.PI + 90) % 360) + 360) % 360;
      const n = Math.round(compass / 10) || 36;
      return String(n).padStart(2, '0');
    };
    this.labels = [num(Math.atan2(this.uy, this.ux)), num(Math.atan2(-this.uy, -this.ux))];
  }

  /** Absolute centerline point, s measured from end A. */
  center(s: number): Point {
    return { x: this.ax + this.ux * s, y: this.ay + this.uy * s };
  }

  /** Point on the parallel taxiway, s measured from end A. */
  taxi(s: number): Point {
    const c = this.center(s);
    return { x: c.x + this.nx * this.taxiOff, y: c.y + this.ny * this.taxiOff };
  }

  /** Hold-short point on the end connector at landing end e. */
  hold(e: 0 | 1 = this.active): Point {
    const c = this.center(e === 0 ? 0 : this.length);
    const off = this.width / 2 + 9;
    return { x: c.x + this.nx * off, y: c.y + this.ny * off };
  }

  threshold(e: 0 | 1 = this.active): Point {
    return e === 0 ? { x: this.ax, y: this.ay } : { x: this.bx, y: this.by };
  }

  angle(e: 0 | 1 = this.active) {
    return e === 0 ? Math.atan2(this.uy, this.ux) : Math.atan2(-this.uy, -this.ux);
  }

  /** Point measured from the threshold of end e along the landing direction, with lateral offset. */
  along(d: number, lateral = 0, e: 0 | 1 = this.active): Point {
    const t = this.threshold(e);
    const s = e === 0 ? 1 : -1;
    const dx = this.ux * s;
    const dy = this.uy * s;
    return { x: t.x + dx * d - dy * lateral, y: t.y + dy * d + dx * lateral };
  }

  /** Absolute s along A→B for a distance d measured from the threshold of end e. */
  abs(d: number, e: 0 | 1 = this.active) {
    return e === 0 ? d : this.length - d;
  }

  /** Projection of a point onto the taxiway line, clamped to the runway. */
  projectTaxi(p: Point) {
    const s = (p.x - this.ax) * this.ux + (p.y - this.ay) * this.uy;
    return Math.max(0, Math.min(this.length, s));
  }

  /** The two high speed exits as [centerline s, taxiway s] for each landing direction. */
  exit(e: 0 | 1 = this.active): [number, number] {
    const s = this.abs(this.length * this.exitFrac, e);
    return [s, s + (e === 0 ? 28 : -28)];
  }
}

export class Gate {
  readonly span = 120;
  constructor(
    readonly id: string,
    readonly edge: Edge,
    readonly at: number,
  ) {}

  /** Position along the edge of a point. */
  private coord(p: Point) {
    return this.edge === 'top' || this.edge === 'bottom' ? p.x : p.y;
  }

  /** Distance of a point from this gate's edge (positive inside the screen). */
  depth(p: Point) {
    switch (this.edge) {
      case 'top':
        return p.y;
      case 'bottom':
        return H - p.y;
      case 'left':
        return p.x;
      case 'right':
        return W - p.x;
    }
  }

  inSpan(p: Point, slack = 0) {
    return Math.abs(this.coord(p) - this.at) <= this.span / 2 + slack;
  }

  /** Direction pointing out of the screen through this gate. */
  get outAngle() {
    return { top: -Math.PI / 2, right: 0, bottom: Math.PI / 2, left: Math.PI }[this.edge];
  }

  /** A point well outside the screen through the gate, near p. */
  exitPoint(p: Point): Point {
    const c = Math.max(this.at - this.span / 2 + 10, Math.min(this.at + this.span / 2 - 10, this.coord(p)));
    switch (this.edge) {
      case 'top':
        return { x: c, y: -60 };
      case 'bottom':
        return { x: c, y: H + 60 };
      case 'left':
        return { x: -60, y: c };
      case 'right':
        return { x: W + 60, y: c };
    }
  }

  center(inset = 0): Point {
    switch (this.edge) {
      case 'top':
        return { x: this.at, y: inset };
      case 'bottom':
        return { x: this.at, y: H - inset };
      case 'left':
        return { x: inset, y: this.at };
      case 'right':
        return { x: W - inset, y: this.at };
    }
  }
}

export interface Stand {
  x: number;
  y: number;
  heading: number;
  pushX: number;
  pushY: number;
  mouth: { x: number; y: number; runway: number; q: number };
  occupant: object | null;
}

export class Airport {
  readonly runways: Runway[];
  readonly pads: Point[];
  readonly gates: Gate[];
  readonly stands: Stand[] = [];
  readonly mouths: { x: number; y: number; runway: number; q: number }[];

  constructor(readonly def: LayoutDef) {
    this.runways = def.runways.map((r) => new Runway(r, def.exitFrac));
    this.pads = def.pads.map(([x, y]) => ({ x, y }));
    this.gates = def.gates.map((g) => new Gate(g.id, g.edge, g.at));
    const ap = def.apron;
    this.mouths = ap.mouths.map((m) => ({ ...m, q: this.runways[m.runway].projectTaxi(m) }));
    const rowY = ap.terminal === 'bottom' ? ap.y + ap.h - 42 : ap.y + 42;
    const heading = ap.terminal === 'bottom' ? -Math.PI / 2 : Math.PI / 2;
    for (let x = ap.x + 30; x <= ap.x + ap.w - 30; x += 46) {
      const mouth = this.mouths.reduce((best, m) =>
        Math.hypot(m.x - x, m.y - rowY) < Math.hypot(best.x - x, best.y - rowY) ? m : best,
      );
      this.stands.push({
        x,
        y: rowY,
        heading,
        pushX: x,
        pushY: rowY + Math.sin(heading) * 24,
        mouth,
        occupant: null,
      });
    }
  }

  /** Taxi route from a stand to the hold-short point of its runway's active end. */
  departureRoute(stand: Stand): Point[] {
    const rw = this.runways[stand.mouth.runway];
    const e = rw.active;
    return [
      { x: stand.pushX, y: stand.pushY },
      { x: stand.mouth.x, y: stand.mouth.y },
      rw.taxi(stand.mouth.q),
      rw.taxi(e === 0 ? 0 : rw.length),
      rw.hold(e),
    ];
  }
}
