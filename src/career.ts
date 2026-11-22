import { Kind } from './config';
import { LayoutDef, Plot, RunwayDef } from './airport';

export type Feature = 'fast' | 'heavy' | 'transit' | 'wind' | 'depart' | 'fuel';

export type ItemId =
  | 'long'
  | 'pad1'
  | 'terminal'
  | 'contract'
  | 'extend'
  | 'pad2'
  | 'parallel'
  | 'exits'
  | 'weather'
  | 'radar'
  | 'ils'
  | 'crew'
  | 'premium';

export interface BuildItem {
  id: ItemId;
  group: 'facility' | 'upgrade';
  name: string;
  effect: string;
  price: number;
  requires?: ItemId;
  icon: string;
  rotate?: boolean;
}

/** Everything that can be bought between days, cheapest first within each group. */
export const ITEMS: BuildItem[] = [
  { id: 'pad1', group: 'facility', name: 'Helipad', effect: 'Unlocks helicopters', price: 3500, icon: 'icon-pad' },
  { id: 'contract', group: 'facility', name: 'Overflight contract', effect: 'Unlocks overflights', price: 4500, icon: 'ac-transit', rotate: true },
  { id: 'pad2', group: 'facility', name: 'Second helipad', effect: 'More helicopters', price: 4000, requires: 'pad1', icon: 'icon-pad' },
  { id: 'terminal', group: 'facility', name: 'Terminal expansion', effect: '+3 gates', price: 5000, icon: 'icon-terminal' },
  { id: 'long', group: 'facility', name: 'Long runway', effect: 'Unlocks jets', price: 6000, icon: 'icon-runway' },
  { id: 'extend', group: 'facility', name: 'Runway extension', effect: 'Unlocks heavy jets', price: 9000, requires: 'long', icon: 'ac-heavy', rotate: true },
  { id: 'parallel', group: 'facility', name: 'Parallel runway', effect: 'More jets', price: 14000, requires: 'long', icon: 'icon-runway' },
  { id: 'exits', group: 'upgrade', name: 'High-speed exits', effect: 'Faster runway exits', price: 5000, icon: 'icon-exit' },
  { id: 'weather', group: 'upgrade', name: 'Weather station', effect: '15s wind warning', price: 6000, icon: 'icon-wind' },
  { id: 'radar', group: 'upgrade', name: 'Radar upgrade', effect: '10s collision warning', price: 8000, icon: 'icon-radar' },
  { id: 'ils', group: 'upgrade', name: 'Landing system', effect: 'Wider landing zone', price: 9000, icon: 'icon-ils' },
  { id: 'crew', group: 'upgrade', name: 'Ground crew', effect: 'Auto taxi', price: 10000, icon: 'ac-depart', rotate: true },
  { id: 'premium', group: 'upgrade', name: 'Premium airlines', effect: '+25% fares', price: 15000, icon: 'icon-cash' },
];

export const itemById = (id: ItemId) => ITEMS.find((i) => i.id === id)!;

// ------------------------------------------------------------------ the day

/** Real seconds in one shift, from 06:00 to 22:00. */
export const DAY_SECONDS = 210;
export const DAY_START = 6;
export const DAY_END = 22;
/** No new arrivals after this hour, and no new departures after DEPARTURES_END. */
export const ARRIVALS_END = 21;
export const DEPARTURES_END = 20.5;
export const RUSH_START = 11;
export const RUSH_END = 13;

export const hourAt = (elapsed: number) =>
  DAY_START + (DAY_END - DAY_START) * Math.min(1, Math.max(0, elapsed / DAY_SECONDS));

export function clock(hour: number) {
  const mins = Math.floor((hour * 60) / 5) * 5;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How busy the sky is at a given hour, relative to a normal daytime level of 1. */
export function demand(hour: number) {
  const morning = smoothstep(6, 8.5, hour);
  const rush = Math.exp(-(((hour - 12) / 1.05) ** 2));
  const evening = Math.exp(-(((hour - 18) / 1.1) ** 2));
  const fade = 1 - 0.5 * smoothstep(20, 21, hour);
  return (0.55 + 0.45 * morning + 0.8 * rush + 0.25 * evening) * fade;
}

/** First day each difficulty feature appears. */
export const FEATURE_DAYS: Partial<Record<Feature, number>> = { fast: 2, wind: 3, fuel: 4 };

export interface DayDef {
  day: number;
  features: Set<Feature>;
  mix: Partial<Record<Kind, number>>;
  /** Seconds between arrivals at a demand of 1. */
  interval: number;
  /** Director capacity, in load units, at a demand of 1. */
  capacity: number;
  fastChance: number;
  fuelChance: number;
  windEvery: [number, number];
  departEvery: [number, number];
}

export function dayDef(day: number, built: Set<ItemId>): DayDef {
  const has = (id: ItemId) => built.has(id);
  const runways = 1 + (has('long') ? 1 : 0) + (has('parallel') ? 1 : 0);
  const pads = (has('pad1') ? 1 : 0) + (has('pad2') ? 1 : 0);

  const mix: Partial<Record<Kind, number>> = { prop: 0.35 };
  if (has('long')) mix.jet = has('parallel') ? 0.55 : 0.4;
  if (has('pad1')) mix.heli = has('pad2') ? 0.37 : 0.25;
  if (has('extend')) mix.heavy = 0.18;
  if (has('contract')) mix.transit = 0.22;

  const features = new Set<Feature>(['depart']);
  for (const [f, d] of Object.entries(FEATURE_DAYS) as [Feature, number][]) if (day >= d) features.add(f);
  if (has('extend')) features.add('heavy');
  if (has('contract')) features.add('transit');

  const later = Math.max(0, day - 1);
  const boost = 1 + 0.22 * (runways - 1) + 0.12 * pads + (has('contract') ? 0.1 : 0);
  const departScale = (has('terminal') ? 0.6 : 1) / (1 + 0.04 * later);
  return {
    day,
    features,
    mix,
    interval: Math.max(3.4, 6.4 - 0.28 * later) / boost,
    capacity: 2.4 + 0.3 * Math.min(later, 10) + 0.9 * (runways - 1) + 0.4 * pads + (has('contract') ? 0.3 : 0),
    fastChance: features.has('fast') ? Math.min(0.35, 0.15 + 0.03 * (day - 2)) : 0,
    fuelChance: features.has('fuel') ? Math.min(0.22, 0.1 + 0.02 * (day - 4)) : 0,
    windEvery: [Math.max(28, 45 - 2 * (day - 3)), Math.max(38, 60 - 2 * (day - 3))],
    departEvery: [16 * departScale, 24 * departScale],
  };
}

/** Gameplay effects of the utility upgrades. */
export function effects(built: Set<ItemId>) {
  return {
    predictSeconds: built.has('radar') ? 10 : 6,
    landingZone: built.has('ils') ? 36 : 26,
    approachTolDeg: built.has('ils') ? 80 : 60,
    windWarning: built.has('weather') ? 15 : 5,
    autoTaxi: built.has('crew'),
    fareMult: built.has('premium') ? 1.25 : 1,
    exitSpeed: built.has('exits') ? 34 : 28,
  };
}

// ------------------------------------------------------------------ career save

export interface Career {
  day: number;
  cash: number;
  /** Total earned over the whole career. */
  earned: number;
  built: ItemId[];
  /** Items bought since the last day, shown as NEW on the next day's card. */
  fresh: ItemId[];
}

const CAREER_KEY = 'flyme.career';

export const newCareer = (): Career => ({ day: 1, cash: 0, earned: 0, built: [], fresh: [] });

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Career;
    const known = new Set(ITEMS.map((i) => i.id));
    return {
      day: Math.max(1, Math.floor(c.day) || 1),
      cash: Math.max(0, Number(c.cash) || 0),
      earned: Math.max(0, Number(c.earned) || 0),
      built: (c.built ?? []).filter((id) => known.has(id)),
      fresh: (c.fresh ?? []).filter((id) => known.has(id)),
    };
  } catch {
    return null;
  }
}

export function saveCareer(c: Career) {
  try {
    localStorage.setItem(CAREER_KEY, JSON.stringify(c));
  } catch {
    // Storage can be unavailable (private mode); the career just won't survive a reload.
  }
}

export function clearCareer() {
  try {
    localStorage.removeItem(CAREER_KEY);
  } catch {
    // Nothing to clear.
  }
}

// ------------------------------------------------------------------ home airport

const SHORT: RunwayDef = { size: 'short', a: [490, 545], b: [710, 545], side: -1 };
const LONG: RunwayDef = { size: 'long', a: [440, 330], b: [760, 330], side: 1 };
const LONG_EXTENDED: RunwayDef = { size: 'long', a: [380, 330], b: [820, 330], side: 1 };
const PARALLEL: RunwayDef = { size: 'long', a: [460, 190], b: [780, 190], side: 1 };
const PAD1: [number, number] = [400, 450];
const PAD2: [number, number] = [330, 522];

/** The home airport as it stands with the given facilities built. */
export function homeLayout(built: Set<ItemId>): LayoutDef {
  const has = (id: ItemId) => built.has(id);
  const runways: RunwayDef[] = [SHORT];
  if (has('long')) runways.push(has('extend') ? LONG_EXTENDED : LONG);
  if (has('parallel')) runways.push(PARALLEL);

  const apron = has('terminal') ? { x: 520, w: 280 } : { x: 570, w: 130 };
  const mouths = [{ x: 600, y: 474, runway: 0 }];
  if (has('long')) mouths.push({ x: apron.x, y: 444, runway: 1 });

  const pads: [number, number][] = [];
  const links: [number, number][][] = [];
  if (has('pad1')) {
    pads.push(PAD1);
    links.push([
      [apron.x, 462],
      [PAD1[0] + 27, PAD1[1]],
    ]);
  }
  if (has('pad2')) {
    pads.push(PAD2);
    links.push([
      [PAD1[0] - 18, PAD1[1] + 20],
      [PAD2[0] + 18, PAD2[1] - 20],
    ]);
  }
  if (has('parallel')) {
    const link: [number, number][] = [
      [780, 221],
      [800, 221],
      [800, 361],
    ];
    if (!has('extend')) link.push([760, 361]);
    links.push(link);
  }

  // Survey markings for facilities that can still be built.
  const plots: Plot[] = [];
  if (!has('long')) plots.push({ id: 'long', kind: 'runway', a: LONG.a, b: LONG.b, width: 22 });
  else if (!has('extend')) {
    plots.push({ id: 'extend', kind: 'runway', a: LONG_EXTENDED.a, b: LONG.a, width: 22 });
    plots.push({ id: 'extend', kind: 'runway', a: LONG.b, b: LONG_EXTENDED.b, width: 22 });
  }
  if (!has('parallel')) plots.push({ id: 'parallel', kind: 'runway', a: PARALLEL.a, b: PARALLEL.b, width: 22 });
  if (!has('pad1')) plots.push({ id: 'pad1', kind: 'pad', x: PAD1[0], y: PAD1[1] });
  if (!has('pad2')) plots.push({ id: 'pad2', kind: 'pad', x: PAD2[0], y: PAD2[1] });
  if (!has('terminal')) {
    plots.push({ id: 'terminal', kind: 'rect', x: 520, y: 400, w: 50, h: 74 });
    plots.push({ id: 'terminal', kind: 'rect', x: 700, y: 400, w: 100, h: 74 });
  }

  return {
    name: 'Meadow Field',
    theme: 'meadow',
    seed: 42,
    runways,
    pads,
    apron: { x: apron.x, y: 400, w: apron.w, h: 74, terminal: 'top', mouths },
    tower: [845, 528],
    gates: [
      { id: 'A', edge: 'right', at: 250 },
      { id: 'B', edge: 'left', at: 560 },
    ],
    grounds: [290, 140, 570, 470],
    links,
    terrain: {
      lake: { x: 170, y: 610, r: 150 },
      river: [1010, -20, 1060, 120, 1150, 160, 1170, 280, 1190, 400, 1230, 460, 1300, 520],
      roads: [
        [-10, 110, 300, 60, 700, 140, 1290, 70],
        [1290, 430, 1120, 440, 960, 400, 806, 404],
      ],
    },
    plots,
    exitFrac: has('exits') ? 0.36 : 0.5,
  };
}

/** Texture key that changes whenever the airport's look changes. */
export const layoutKey = (built: Set<ItemId>) =>
  `bg-home-${ITEMS.filter((i) => built.has(i.id) && (i.group === 'facility' || i.id === 'exits'))
    .map((i) => i.id)
    .join('-')}`;
