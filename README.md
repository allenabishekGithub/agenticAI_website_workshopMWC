# AI-ready websites

A workshop for Upskilling Week Barcelona (Mobile World Capital): **MCP UI, WebMCP, Jev, and local AI in the browser**.

Original workshop website: https://upskilling-mwc-taller.midudev.workers.dev

This is an English learning copy. File and folder names, code identifiers, tool names, API endpoints, and data field names remain unchanged so you can compare it with the original Spanish repository.

This repository contains:

| Folder | Contents |
| --- | --- |
| `src/` | The workshop website (Astro): home page, agenda, exercise instructions, API documentation, and presentation |
| `src/pages/api/` | The workshop APIs: a **Jev** proxy and an **OpenAI** proxy, protected with a shared token |
| `retos/` | The four exercises, each with starter code (`inicio/`), a solution (`solucion/`), and instructions (`README.md`) |
| `directo/` | Live demonstration code. `directo/liga` contains an MCP server for LaLiga results, followed by a version with an interface |

## Installation

This is a monorepo. Each exercise (`retos/*/inicio`, `retos/*/solucion`) and each live demonstration (`directo/liga/*`) is a workspace. One installation at the root installs dependencies for the entire project, using whichever package manager you prefer:

```bash
npm install    # or
pnpm install   # or
bun install
```

There is a lockfile for each package manager (`package-lock.json`, `pnpm-lock.yaml`, and `bun.lock`). If you change dependencies, update all three.

You can also install from an exercise folder: `npm install` installs just that exercise, while `pnpm install` and `bun install` install the entire monorepo.

## The website

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then fill in the API keys and workshop token
pnpm dev
```

| Route | Contents |
| --- | --- |
| `/` | Workshop introduction and prerequisites |
| `/agenda` | The schedule and time allocated to each section (edit `src/data/agenda.ts`) |
| `/retos` | Exercise instructions, generated from `retos/*/README.md` |
| `/apis` | Instructions for using the Jev and OpenAI APIs |
| `/slides` | The presentation |

### Presentation

`→`, Space, or `Enter`: next slide · `←`: previous slide · Home / End · `F`: full screen. You can also click the right or left half of the screen or use a presentation remote. Each slide has its own URL, such as `/slides#12`.

Slides are defined in `src/pages/slides.astro`; the first and last slides are images from `public/slides/`.

## The APIs

Participants use a single shared token (`WORKSHOP_TOKEN`). The real provider API keys stay on the server.

| Endpoint | Destination |
| --- | --- |
| `POST /api/jev` (or `/api/jev/v1/systemone`) | `api.typesafe.ai/v1/systemone` |
| `GET /api/jev/v1/models` | `api.typesafe.ai/v1/models` |
| `POST /api/openai/v1/chat/completions` | OpenAI |
| `POST /api/openai/v1/responses` | OpenAI |
| `GET /api/openai/v1/models` | List of allowed models |

- Open CORS allows requests from the browser.
- The limit is 300 requests every 10 seconds per IP address, with a 256 KB limit per request (`wrangler.jsonc` and `src/lib/proxy.ts`). Because everyone in the room shares Wi-Fi and therefore an IP address, the request limit is intended for the entire room. HTTP 429 responses include `Retry-After`; the OpenAI SDK retries automatically.
- Allowed OpenAI models are configured through `OPENAI_MODELS` in `wrangler.jsonc`.
- The proxies work with the official SDKs by changing `baseURL` (see `/apis`).

## Deploying to Cloudflare

```bash
pnpm wrangler secret put WORKSHOP_TOKEN
pnpm wrangler secret put OPENAI_API_KEY
pnpm wrangler secret put TYPESAFE_API_KEY

pnpm build && pnpm wrangler deploy
```

The token is not committed to git. At build time, it is read from `WORKSHOP_TOKEN` in `.dev.vars` and displayed on `/apis` and in the slides. Participants paste it once into `retos/config.js`, which is shared by all exercises. It must match the Worker's secret. Because `pnpm deploy` builds locally, the deployed website displays it too. After the workshop, change the secret to disable the old token.

## The exercises

One online shop, four pieces:

| Exercise | Folder | Start command |
| --- | --- | --- |
| 1 · MCP UI | `retos/01-mcp-ui` | `npm install && npm run dev` → `http://localhost:3001/mcp` |
| 2 · WebMCP | `retos/02-webmcp` | `npm install && npm run dev` → `http://localhost:3002` |
| 3 · Jev | `retos/03-jev` | Same commands → `http://localhost:3003`; paste the token into `retos/config.js` |
| 4 · Local AI | `retos/04-ia-local` | Same commands → `http://localhost:3004`. `solucion/` contains the complete application |

Exercises 2, 3, and 4 share the same shop: each exercise's starter code (`inicio`) is the previous exercise's solution (`solucion`). Only `src/webmcp.js`, `src/jev.js`, and `src/ia-local.js` change.

Start each exercise from `inicio/`. Its demo has two tabs, **Your code** and **View solution**, allowing you to run the `solucion/` version without starting another server:

- Exercise 1: the tester (`http://localhost:3001`) talks to `/mcp` or `/solucion/mcp`; the latter uses `crearServidor()` from `solucion/server.js`.
- Exercises 2–4: the Vite plugin `retos/ver-solucion.js`, configured in each starter's `vite.config.js`, serves the `solucion` folder at `/solucion/` (`http://localhost:300N/solucion/`).

In exercise 2, the `retos/asistente/plugin.js` plugin adds a `gpt-6-luna` chat to both tabs. It uses the page's WebMCP tools (`getTools()` and `executeTool()`). Requests go through the workshop's OpenAI proxy using the token from `retos/config.js`, or `WORKSHOP_TOKEN` in `.dev.vars` if that token is empty.

Each exercise uses port `300N`, where N is the exercise number. Live demonstrations use separate ports starting at `3101`: `directo/liga/1-mcp` uses 3101 and `directo/liga/2-mcp-ui` uses 3102. They never overlap, so you can run all of them at once. Follow the same scheme when adding another exercise or demo.
