import { defineConfig } from 'vite';

// The page lives in web/. A relative base lets the same build work at
// https://hrhgit.github.io/nightrune/ and from a local preview.
export default defineConfig({
  root: 'web',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
});
