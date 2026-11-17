// @ts-check
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// Sources with `pnpm fonts` (scripts/subset-fonts.sh). Astro serves them with hash in.
// /_astro/fonts/ (inmutable cache), injects @font-face online and generates  fallbacks with metrics
// adjusted to avoid jumps from the deck while loading.
const fallbacks = ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'];

// /directo/mario: The ROM lives in the "Wind"/ (not known by git) and is only used by the development server.
// In the "Drink" is not here: the page asks to drag the.nes and saves it in the browser.
const MARIO_ROM = 'Super Mario Bros. (World).nes';
const MARIO_ROM_URL = '/games/super-mario-bros.nes';

function romDeMario() {
  return {
    name: 'rom-de-mario',
    /** @param {{ config: { root: string }, middlewares: { use(fn: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void): void } }} server */
    configureServer(server) {
      const archivo = path.join(server.config.root, 'games', MARIO_ROM);
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== MARIO_ROM_URL) return next();
        if (!existsSync(archivo)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('cache-control', 'no-store');
        createReadStream(archivo).pipe(res);
      });
    },
  };
}

// Transformers.js (Whisper and local chat, runonweb modules) packaging
// onnxruntime-web, whose backup ism (25.6 MiB) exceeds the file limit of the Hardtach.
// Transformers.js and runonweb always load it from jsDelivr, so that copy is not used: it is removed from the build.
function sinWasmDeOnnx() {
  return {
    name: 'sin-wasm-de-onnx',
    /** @param {unknown} _ @param {Record<string, unknown>} bundle */
    generateBundle(_, bundle) {
      for (const nombre of Object.keys(bundle)) {
        if (/(^|\/)ort-wasm-[^/]*\.wasm$/.test(nombre)) delete bundle[nombre];
      }
    },
  };
}

// Astro 2001 (astro:fonts): when the Cloudflare plugin restarts Vite (changes in.dev.vars,).Vite (changes in.dev.vars,___________________________________________________________________________________________________
// wrangler.jsonc, restart of the workstation...) reuses the same instance of the font plugin.
// buildStart of the new server runs BEFORE the old buildEnd, and that buildEnd emptys the status
// Share: /_astro/fonts/* goes on to give 404 and the web falls to the  fallback (Courier). In dev that buildEnd
// only performs cleanup, so we skip it; the build is unchanged (it copies the fonts to dist).
function fuentesTrasReiniciar() {
  const PARCHEADO = Symbol.for('workshop:sources-after-restart');
  return {
    name: 'fuentes-tras-reiniciar',
    /** @param {{ plugins: readonly any[] }} config */
    configResolved(config) {
      const fuentes = config.plugins.find((p) => p.name === 'astro:fonts');
      if (typeof fuentes?.buildEnd !== 'function' || fuentes.buildEnd[PARCHEADO]) return;
      const original = fuentes.buildEnd;
      /** @this {{ environment: { config: { command: string } } }} @param {unknown[]} args */
      const buildEnd = function (...args) {
        if (this.environment.config.command === 'serve') return;
        return original.apply(this, args);
      };
      buildEnd[PARCHEADO] = true;
      fuentes.buildEnd = buildEnd;
    },
  };
}

// Pages are pre-rendered (static). /api/* only (and /directo/entradas) run on the Worker.
export default defineConfig({
  adapter: cloudflare(),
  // agenda.html instead of agenda/index.html: Cloudflare serves / Agenda directly (200) instead of
  // redirect with a {clander} to /(088/), which added a round-trip before the HTML (and sources). (and from sources)
  build: { format: 'file' },
  // APIs are called from other sources and protected with the workshop token
  security: { checkOrigin: false },
  markdown: {
    shikiConfig: { theme: 'css-variables' },
  },
  // The /directo/traductor translator is a component of React (client:28)
  integrations: [react()],
  vite: {
    plugins: [romDeMario(), fuentesTrasReiniciar(), sinWasmDeOnnx()],
    // Mario's (future simulated) hairpins, Whisper and local chat are ES modules
    worker: { format: 'es', plugins: () => [sinWasmDeOnnx()] },
    // Without this, Vite discovers these dependencies by opening the page and reloading it in the middle of the demo
    optimizeDeps: {
      include: [
        'jsnes',
        '@huggingface/transformers',
        'marked',
        'runonweb/translate',
        'runonweb/remove-bg',
        'runonweb/caption',
        'runonweb/emoji',
        'runonweb/tts',
      ],
    },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Geist Pixel',
      cssVariable: '--font-pixel',
      fallbacks,
      options: {
        variants: [{ src: ['./src/assets/fonts/GeistPixel-Square-Latin.woff2'], weight: '400 500', style: 'normal' }],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist Mono',
      cssVariable: '--font-mono',
      fallbacks,
      options: {
        variants: [{ src: ['./src/assets/fonts/GeistMono-Latin.woff2'], weight: '400 700', style: 'normal' }],
      },
    },
  ],
});
