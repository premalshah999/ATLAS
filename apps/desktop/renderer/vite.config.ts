import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Relative base so the built renderer loads from file:// inside Electron.
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: path.resolve(__dirname, '../dist'), emptyOutDir: true },
});
