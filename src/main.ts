import Phaser from 'phaser';
import { W, H, ZOOM } from './config';
import { GameScene } from './GameScene';

async function boot() {
  // Make sure the web font is ready before Phaser rasterizes any text.
  try {
    await Promise.all([
      document.fonts.load('700 20px Rubik'),
      document.fonts.load('800 20px Rubik'),
      document.fonts.load('500 20px Rubik'),
    ]);
  } catch {
    // Fall back to system fonts if the font can't load (offline, etc).
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    // Render at 2x the world size so everything stays crisp when scaled.
    width: W * ZOOM,
    height: H * ZOOM,
    backgroundColor: '#0b1410',
    antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [GameScene],
  });
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}

boot();
