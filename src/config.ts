export const W = 1280;
export const H = 720;
export const ZOOM = 2;

export type Kind = 'jet' | 'heavy' | 'prop' | 'heli' | 'transit' | 'depart';
export type Dest = 'long' | 'short' | 'pad' | 'gate';

export interface KindInfo {
  color: number;
  css: string;
  speed: number;
  dest: Dest;
  /** Collision radius in world pixels. */
  radius: number;
  legend: string;
}

const RED = 0xff5d4f;
const YELLOW = 0xffc93c;
const BLUE = 0x4fc3ff;
export const GREEN = 0x5ee08a;
export const GREEN_CSS = '#5ee08a';

export const KINDS: Record<Kind, KindInfo> = {
  jet: { color: RED, css: '#ff5d4f', speed: 44, dest: 'long', radius: 9.5, legend: 'Long runway' },
  heavy: { color: RED, css: '#ff5d4f', speed: 32, dest: 'long', radius: 13, legend: 'Heavy jet' },
  prop: { color: YELLOW, css: '#ffc93c', speed: 31, dest: 'short', radius: 9.5, legend: 'Short runway' },
  heli: { color: BLUE, css: '#4fc3ff', speed: 23, dest: 'pad', radius: 9.5, legend: 'Helipad' },
  transit: { color: GREEN, css: GREEN_CSS, speed: 46, dest: 'gate', radius: 9.5, legend: 'Exit gate' },
  depart: { color: GREEN, css: GREEN_CSS, speed: 40, dest: 'gate', radius: 9.5, legend: 'Exit gate' },
};

export const FAST_MULT = 1.45;
export const TAXI_SPEED = 20;
/** Speed of a landing aircraft as it turns off the runway; quicker exits free the runway sooner. */
export const EXIT_SPEED = 28;
/** Minimum turn radius of heavy jets, in world pixels. */
export const HEAVY_TURN_RADIUS = 72;
export const ZONE_RADIUS = 26;
export const FONT = 'Rubik, system-ui, sans-serif';
