# Start here

This folder is an English learning copy of `upskilling-mwc-taller`. The original repository is unchanged.

## What you are building

A demonstration online shop that an AI assistant can use. The four lessons add an interactive catalog inside a chat, browser-agent tools, AI recommendations and review moderation, and local review summaries.

The root Astro application is the workshop website and presentation. The hands-on lessons are in `retos/`.

## Your first session

Dependencies have already been installed in this copy. To start the first lesson:

```bash
cd /home/allen/projects/agenticAI_website_workshopMWC/retos/01-mcp-ui/inicio
npm run dev
```

Open http://localhost:3001.

1. Choose **View solution** to see the completed behavior.
2. Return to **Your code**.
3. Read [the exercise instructions](retos/01-mcp-ui/README.md).
4. Open `server.js` and complete TODO 1.
5. Save and try it in the browser before moving on.

You can inspect the files under `../solucion/` whenever you get stuck. Keep your own exercise work in `inicio/`.

## The learning path

| Lesson | What you learn | Main files | Local address |
| --- | --- | --- | --- |
| [1 · MCP UI](retos/01-mcp-ui/README.md) | Show an interactive product catalog inside an assistant's chat | `server.js`, `vista/app.js` | http://localhost:3001 |
| [2 · WebMCP](retos/02-webmcp/README.md) | Expose website functions to browser agents | `src/webmcp.js` | http://localhost:3002 |
| [3 · Jev](retos/03-jev/README.md) | Rank products and moderate reviews using structured AI decisions | `src/jev.js` | http://localhost:3003 |
| [4 · Local AI](retos/04-ia-local/README.md) | Summarize reviews with a model running in the browser | `src/ia-local.js` | http://localhost:3004 |

Run `npm run dev` from the corresponding exercise's `inicio/` folder. Each lesson has a separate port.

The exercise instructions describe the browser features needed for WebMCP and local AI. Cloud-backed demonstrations and AI chat helpers need a valid workshop token in `retos/config.js`. The repository does not include a working token or provider API keys. Local models need an initial download.

## Why some names are still Spanish

Code identifiers, file and folder paths, tool names, endpoint paths, schema keys, and internal data values retain their original names. This preserves compatibility and makes it easier to compare the starter code with the original solutions.

| Spanish name | Meaning |
| --- | --- |
| `retos` | exercises |
| `inicio` | starter code |
| `solucion` | solution |
| `directo` | live demonstration |
| `probador` | tester |
| `tienda` | shop |
| `productos` | products |
| `vista` | view / interface |
| `estilos` | styles |
| `carrito` | cart |
| `reseñas` | reviews |
| `buscar_productos` | search products |
| `anadir_al_carrito` | add to cart |
| `ver_producto` | view product |
| `ver_carrito` | view cart |
| `vaciar_carrito` | empty cart |
| `busqueda_inteligente` | smart search |
| `resumir_resenas` | summarize reviews |
| `ver_clasificacion` | view standings |
| `ver_resultados` | view results |
| `ver_equipo` | view team |
| `nombre` | name |
| `descripcion` | description |
| `categoria` | category |
| `precio` | price |
| `cantidad` | quantity |
| `escritorio` | desk |
| `viaje` | travel |
| `hogar` | home |

Original images are preserved. [English text for the images](IMAGE-TEXT.en.md) explains the title slide and shop screenshots.
