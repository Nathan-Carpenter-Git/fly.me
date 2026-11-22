import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser alone is ~1.2 MB minified; the game code itself is small.
    chunkSizeWarningLimit: 1500,
  },
});
