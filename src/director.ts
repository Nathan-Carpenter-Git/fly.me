import { W, H, Kind, Dest, KINDS } from './config';
import { Point } from './airport';

export type Edge = 'left' | 'right' | 'top' | 'bottom';

/** What the director needs to know about an aircraft already in the sky. */
export interface Traffic {
  now: Point;
  /** Predicted positions at fixed time steps (empty once it lands). */
  future: Point[];
  incoming: boolean;
}

export interface Entry {
  x: number;
  y: number;
  heading: number;
  edge: Edge;
}

/** HUD panels at the screen edges; incoming traffic markers should not hide behind them. */
const HUD_RECTS: [number, number, number, number][] = [
  [0, 0, 190, 90],
  [420, 0, 440, 90],
  [1110, 0, 170, 150],
  [0, 650, 680, 70],
];

const SPAWN_OFFSET = 70;

/**
 * The traffic director paces the level. It watches how busy the sky is and how
 * stressed the player has recently been, holds back new arrivals when things
 * pile up, picks aircraft types whose destinations are least crowded, and brings
 * new traffic in from the quietest direction.
 */
export class Director {
  /** Short-term stress from near misses, alerts and go-arounds. Decays over time. */
  heat = 0;

  reset() {
    this.heat = 0;
  }

  bump(amount: number) {
    this.heat = Math.min(3, this.heat + amount);
  }

  update(dt: number) {
    this.heat = Math.max(0, this.heat - dt * 0.18);
  }

  /** True when the sky has room for another arrival. */
  allowSpawn(load: number, capacity: number) {
    return load + this.heat < capacity;
  }

  /** Weighted pick that favors aircraft whose destination is not already crowded. */
  pickKind(mix: Partial<Record<Kind, number>>, destLoad: Record<Dest, number>): Kind {
    const options = (Object.entries(mix) as [Kind, number][]).map(([k, w]) => {
      const crowd = destLoad[KINDS[k].dest];
      return [k, w / (1 + 0.9 * crowd * crowd)] as const;
    });
    let r = Math.random() * options.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of options) {
      r -= w;
      if (r <= 0) return k;
    }
    return options[options.length - 1][0];
  }

  /**
   * Tries a dozen entry points around the edge and keeps the one whose straight-in
   * track stays farthest from everybody else over the next few seconds.
   */
  pickEntry(aim: Point, speed: number, others: Traffic[], step: number, avoidEdge?: Edge): Entry {
    let best: Entry | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 14; i++) {
      const c = this.randomEdgePoint(avoidEdge);
      const tx = aim.x + (Math.random() - 0.5) * 160;
      const ty = aim.y + (Math.random() - 0.5) * 120;
      const heading = Math.atan2(ty - c.y, tx - c.x);
      const vx = Math.cos(heading) * speed * step;
      const vy = Math.sin(heading) * speed * step;
      let sep = 260;
      for (const o of others) {
        sep = Math.min(sep, Math.hypot(o.now.x - c.x, o.now.y - c.y) * 0.8);
        for (let k = 0; k < o.future.length; k++) {
          const px = c.x + vx * (k + 1);
          const py = c.y + vy * (k + 1);
          sep = Math.min(sep, Math.hypot(o.future[k].x - px, o.future[k].y - py));
        }
      }
      // Two arrival markers stacked on the same stretch of edge are hard to read.
      const crowdedEdge = others.some((o) => o.incoming && Math.hypot(o.now.x - c.x, o.now.y - c.y) < 220);
      const score = sep - (crowdedEdge ? 120 : 0) + Math.random() * 10;
      if (score > bestScore) {
        bestScore = score;
        best = { ...c, heading };
      }
    }
    return best!;
  }

  private randomEdgePoint(avoidEdge?: Edge): { x: number; y: number; edge: Edge } {
    for (let tries = 0; tries < 30; tries++) {
      const edges: Edge[] = (['left', 'right', 'top', 'bottom'] as Edge[]).filter((e) => e !== avoidEdge);
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const along = edge === 'left' || edge === 'right' ? 90 + Math.random() * (H - 180) : 120 + Math.random() * (W - 240);
      const p =
        edge === 'left'
          ? { x: -SPAWN_OFFSET, y: along }
          : edge === 'right'
            ? { x: W + SPAWN_OFFSET, y: along }
            : edge === 'top'
              ? { x: along, y: -SPAWN_OFFSET }
              : { x: along, y: H + SPAWN_OFFSET };
      // The arrival marker sits where the point is clamped onto the screen.
      const mx = Math.max(22, Math.min(W - 22, p.x));
      const my = Math.max(22, Math.min(H - 22, p.y));
      const hidden = HUD_RECTS.some(([x, y, w, h]) => mx > x - 20 && mx < x + w + 20 && my > y - 20 && my < y + h + 20);
      if (!hidden) return { ...p, edge };
    }
    return { x: -SPAWN_OFFSET, y: H / 2, edge: 'left' };
  }
}
