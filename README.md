# fly.me

A browser air traffic control game.
Drag a path from each aircraft to the landing spot of its color, launch departures from the terminal, and keep everything from colliding.
Every day you earn money, and between days you spend it growing your airport.
One crash and you're fired, so the whole career starts over.

Built with [Phaser 4](https://phaser.io), TypeScript and Vite.
All art and music are generated in code, so there are no asset files.

## Play locally

```sh
npm install
npm run dev
```

Then open http://localhost:5173.

## How a career works

- Each day is a shift from 06:00 to 22:00 that lasts about three and a half minutes.
- Traffic builds through the morning, peaks at rush hour around noon, and eases off in the evening.
- Every aircraft pays a fare, with bonuses for streaks, smooth approaches and fuel emergencies.
- Between days you buy facilities on fixed plots at your airport, which unlock new traffic and raise capacity.
- Utility upgrades cost more and make the job easier, such as longer collision warnings or auto taxi.
- New conditions appear as the days go on: fast planes on day 2, wind shifts on day 3, fuel emergencies on day 4.
- Your career is saved in the browser between sessions until you get fired.

## Controls

| Input | Action |
| --- | --- |
| Drag from an aircraft | Draw its route |
| Click a parked plane | Taxi to the runway, click again to take off |
| P or Space | Pause |
| F | Toggle 3x speed |
| M | Toggle music |
| N | End the day early |
| R (title screen) | Replay the tips |
| C (build menu, dev server only) | Add $10,000 for testing |

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
| `src/career.ts` | Days, rush hour demand, shop items, saved career and the home airport layout |
| `src/buildMenu.ts` | Between-days build menu |
| `src/airport.ts` | Runway, taxiway and gate geometry, plus other airport layouts for later |
| `src/director.ts` | Traffic pacing and spawn placement |
| `src/coach.ts` | In-game tips with spotlight |
| `src/textures.ts` | Procedural aircraft, icons and map art |
| `src/music.ts` | Generative music engine |
| `src/audio.ts` | Sound effects |
