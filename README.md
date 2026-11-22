# fly.me

A browser air traffic control game.
Drag a path from each aircraft to the landing spot of its color, launch departures from the terminal, and keep everything from colliding.

Built with [Phaser 4](https://phaser.io), TypeScript and Vite.
All art and music are generated in code, so there are no asset files.

## Play locally

```sh
npm install
npm run dev
```

Then open http://localhost:5173.

## Controls

| Input | Action |
| --- | --- |
| Drag from an aircraft | Draw its route |
| Click a parked plane | Taxi to the runway, click again to take off |
| P or Space | Pause |
| N | Skip to the next level |
| M | Toggle music |
| 1 to 7 (title screen) | Start at a level |
| R (title screen) | Replay the tips |

## What's in it

- Seven hand-built airports with their own layouts and landscapes, then endless levels that cycle through them.
- Jets, heavy jets, props, helicopters, overflights and departures, each with its own destination.
- Runway occupancy with go-arounds, wind shifts that flip the runways, and fast traffic.
- Collision prediction that marks where two aircraft are about to meet.
- A traffic director that paces arrivals and brings new traffic in from the quietest direction.
- Generative lo-fi background music.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run typecheck` | Typecheck only |

## Project layout

| File | Contents |
| --- | --- |
| `src/GameScene.ts` | Game loop, aircraft behavior, input, HUD and cards |
| `src/airport.ts` | Airport layouts, runway and gate geometry |
| `src/levels.ts` | Level progression and tuning |
| `src/director.ts` | Traffic pacing and spawn placement |
| `src/coach.ts` | In-game tips with spotlight |
| `src/textures.ts` | Procedural aircraft and map art |
| `src/music.ts` | Generative music engine |
| `src/audio.ts` | Sound effects |
