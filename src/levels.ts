import { Kind } from './config';
import { LAYOUTS } from './airport';

export type Feature = 'fast' | 'heavy' | 'transit' | 'wind' | 'depart' | 'fuel';

export interface LevelDef {
  number: number;
  layout: number;
  /** Arrivals plus overflights needed to clear the level. */
  goal: number;
  departGoal: number;
  features: Set<Feature>;
  /** Newly introduced feature, shown on the intro card. */
  introduces?: Feature;
  /** Seconds between arrivals at the start and at the end of the level. */
  spawn: [number, number];
  /** Max aircraft in the air at the start and at the end of the level. */
  maxAir: [number, number];
  mix: Partial<Record<Kind, number>>;
  fastChance: number;
  /** Chance that an arrival declares a fuel emergency. */
  fuelChance: number;
  windEvery: [number, number];
  departEvery: [number, number];
}

const ALL: Feature[] = ['fast', 'heavy', 'transit', 'wind', 'depart', 'fuel'];

const BASE = {
  windEvery: [40, 55] as [number, number],
  departEvery: [15, 22] as [number, number],
  fuelChance: 0,
};

const HAND_MADE: Omit<LevelDef, 'number'>[] = [
  {
    ...BASE,
    layout: 0,
    goal: 8,
    departGoal: 2,
    features: new Set(['depart']),
    spawn: [6.5, 4.8],
    maxAir: [2.6, 4],
    mix: { jet: 0.45, prop: 0.35, heli: 0.2 },
    fastChance: 0,
  },
  {
    ...BASE,
    layout: 1,
    goal: 10,
    departGoal: 2,
    features: new Set(['fast', 'depart']),
    introduces: 'fast',
    spawn: [6.2, 4.2],
    maxAir: [3, 4.6],
    mix: { jet: 0.4, prop: 0.35, heli: 0.25 },
    fastChance: 0.2,
  },
  {
    ...BASE,
    layout: 2,
    goal: 12,
    departGoal: 3,
    features: new Set(['fast', 'heavy', 'depart']),
    introduces: 'heavy',
    spawn: [5.8, 4],
    maxAir: [3.4, 5.2],
    mix: { jet: 0.3, heavy: 0.25, prop: 0.3, heli: 0.15 },
    fastChance: 0.2,
  },
  {
    ...BASE,
    layout: 3,
    goal: 12,
    departGoal: 3,
    features: new Set(['fast', 'heavy', 'transit', 'depart']),
    introduces: 'transit',
    spawn: [5.6, 3.8],
    maxAir: [3.6, 5.6],
    mix: { jet: 0.25, heavy: 0.12, prop: 0.25, heli: 0.13, transit: 0.25 },
    fastChance: 0.2,
  },
  {
    ...BASE,
    layout: 4,
    goal: 14,
    departGoal: 3,
    features: new Set(['fast', 'heavy', 'transit', 'wind', 'depart']),
    introduces: 'wind',
    spawn: [5.4, 3.6],
    maxAir: [4, 6],
    mix: { jet: 0.28, heavy: 0.14, prop: 0.25, heli: 0.15, transit: 0.18 },
    fastChance: 0.22,
  },
  {
    ...BASE,
    layout: 5,
    goal: 14,
    departGoal: 5,
    features: new Set(ALL),
    spawn: [5, 3.3],
    maxAir: [4.4, 6.6],
    mix: { jet: 0.3, heavy: 0.12, prop: 0.25, heli: 0.15, transit: 0.18 },
    fastChance: 0.25,
    departEvery: [9, 14],
    introduces: 'fuel',
    fuelChance: 0.14,
  },
  {
    ...BASE,
    layout: 6,
    goal: 16,
    departGoal: 5,
    features: new Set(ALL),
    spawn: [4.8, 3.1],
    maxAir: [5, 7.2],
    mix: { jet: 0.28, heavy: 0.14, prop: 0.22, heli: 0.16, transit: 0.2 },
    fastChance: 0.28,
    fuelChance: 0.14,
  },
];

export function getLevel(index: number): LevelDef {
  if (index < HAND_MADE.length) return { ...HAND_MADE[index], number: index + 1 };
  // Endless levels cycle through every airport with everything switched on and rising pressure.
  const k = index - HAND_MADE.length + 1;
  const base = HAND_MADE[HAND_MADE.length - 1];
  return {
    ...base,
    number: index + 1,
    layout: index % LAYOUTS.length,
    goal: 16 + 2 * k,
    departGoal: 4 + Math.floor(k / 2),
    introduces: undefined,
    spawn: [Math.max(3.2, 5 - 0.25 * k), Math.max(2, 3 - 0.15 * k)],
    maxAir: [5, Math.min(10, 7.2 + 0.5 * k)],
    fastChance: Math.min(0.5, 0.28 + 0.04 * k),
    fuelChance: Math.min(0.25, 0.14 + 0.02 * k),
    windEvery: [Math.max(25, 40 - 2 * k), Math.max(35, 55 - 2 * k)],
    departEvery: [Math.max(8, 13 - k), Math.max(12, 19 - k)],
  };
}

export const HAND_MADE_COUNT = HAND_MADE.length;
