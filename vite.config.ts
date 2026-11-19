import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The pages live in web/. A relative base lets the same build work at
// https://hrhgit.github.io/nightrune/ and from a local preview.
// scene.html is the scene preview page used for visual checks (npm run scenes).
export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./web/index.html', import.meta.url)),
        scene: fileURLToPath(new URL('./web/scene.html', import.meta.url)),
      },
    },
  },
});
