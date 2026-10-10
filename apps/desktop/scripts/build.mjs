// Bundles Electron main, preload and the daemon. The renderer is built by Vite.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist-electron');
const watch = process.argv.includes('--watch');
const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, logLevel: 'info', absWorkingDir: root };

const configs = [
  { ...common, entryPoints: ['electron-main/src/main.ts'], outfile: path.join(out, 'main.cjs'), format: 'cjs', external: ['electron'] },
  { ...common, entryPoints: ['preload/src/preload.ts'], outfile: path.join(out, 'preload.cjs'), format: 'cjs', external: ['electron'] },
  {
    ...common, entryPoints: ['../daemon/src/main.ts'], outfile: path.join(out, 'daemon.mjs'), format: 'esm',
    // Pi and its provider SDKs load assets at runtime; they stay in node_modules.
    external: ['@earendil-works/*', 'typebox', 'electron'],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  },
];

if (watch) {
  const { context } = await import('esbuild');
  for (const c of configs) await (await context(c)).watch();
} else {
  await Promise.all(configs.map((c) => build(c)));
}
