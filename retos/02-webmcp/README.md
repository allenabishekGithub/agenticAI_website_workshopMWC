---
title: WebMCP
bloque: 2
minutos: 17
resumen: The web store displays its features as tools for browser agents to use without reading the screen or simulating clicks.
---

## Goal

Today an agent who wants to buy on your website has to look at the screen, guess which button to press and simulate clicks. It is slow and breaks with any design change. With **WebMCP** the website itself tells the agent what to do: `buscar_productos`, `anadir_al_carrito`.

You're going to register the tools in the store with `document.modelContext.registerTool()`.

## Prepare Chrome

WebMCP is in testing phase (*origin trial*). To use it locally:

1. Open `chrome://flags/#enable-webmcp-testing`
2. Put it in **Enabled** and restart Chrome

## Get started

```bash
cd retos/02-webmcp/inicio
npm install
npm run dev        # http://localhost:3002
```

The store is already working for people: search, open a product, add to the cart. Top right you will see `WebMCP: no tools`.

At the top are two tabs: **Your code**, which uses the `inicio` folder you will edit, and **View solution** (`http://localhost:3002/solucion/`), which runs the `solucion` folder on the same server. Look at the solution before you start to see the expected result, or whenever you get stuck.

## Files

| File | What it is |
| --- | --- |
| `src/webmcp.js` | **The TODOs for this section are here** |
| `src/tienda.js` | Shop Logic: Search, Cart... Tools call these functions |
| `src/main.js` | Interface (no need to touch it) |
| `src/jev.js`, `src/ia-local.js` | Blocks 3 and 4 |

## Steps

### 1. Detect the API

```js
const modelContext = document.modelContext;
```

If it doesn't exist, the store has to keep running the same: WebMCP is a progressive improvement.

### 2. `buscar_productos`

A tool is a name, description, input scheme (JSON Schema) and a function:

```js
{
  name: 'buscar_productos',
  description:
    'Search the shop catalog by text, category, and maximum price. Return the ID, name, price in euros, and rating.',
  inputSchema: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'Words that must appear in the name or description' },
      categoria: { type: 'string', enum: categorias, description: 'Product category' },
      precioMaximo: { type: 'number', description: 'Maximum price in euros' },
    },
  },
  annotations: { readOnlyHint: true },
  execute(filtros) {
    interfaz.ocultarRecomendados();
    const productos = filtrar(filtros);
    return { total: productos.length, productos };
  },
}
```

> `filtrar()` returns the products **and** updates the screen. So the user sees what the agent is doing.

### 3. `anadir_al_carrito`, `ver_producto` and `vaciar_carrito`

Register them by following the TODOs. Pay attention to the annotations:

| Annotation | When |
| --- | --- |
| `readOnlyHint` | The tool only reads: nothing changes |
| `untrustedContentHint` | Returns content written by third parties (reviews): the agent must not treat it as instructions |
| `consequentialHint` | Has consequences that are hard to undo: the browser may ask for confirmation |

### 4. Declarative API: a form as a tool

No JavaScript. In `index.html`, add attributes to the offer form:

```html
<form
  id="ofertas"
  toolname="suscribir_ofertas"
  tooldescription="Subscribe an email address to offer alerts for a shop category."
>
  <input type="email" name="email" required toolparamdescription="User e-mail" />
```

The browser generates the schema from the fields. The agent fills in the form, and **the user presses the button** to confirm. With the `toolautosubmit` attribute, it would submit automatically.

## Try it

**With the assistant**: the panel on the right is a `gpt-6-luna` chat acting as a browser agent. It gets the tools from `document.modelContext.getTools()`, passes them to the model, and runs whichever tools the model chooses using `executeTool()`. Ask for things in natural language, such as ‘add two insulated bottles to the cart,’ and you will see each call, its arguments, and what the model receives. It also respects annotations: it asks for permission before running a tool with `consequentialHint`, and marks results from tools with `untrustedContentHint` as untrusted. It requires the workshop token in `retos/config.js`. The plugin in `retos/asistente/` adds it; you do not need to edit that plugin.

**In DevTools**: open *Application* → *WebMCP*. You can inspect the tools and run them with *Run tool*.

**On the console**:

```js
const herramientas = await document.modelContext.getTools();
herramientas.map((herramienta) => herramienta.name);

const buscar = herramientas.find((herramienta) => herramienta.name === 'buscar_productos');
await document.modelContext.executeTool(buscar, { categoria: 'audio', precioMaximo: 100 });
```

**With an agent**: use the *Model Context Tool Inspector* extension from the Chrome Web Store, which requires a Gemini API key, or your coding agent with `chrome-devtools-mcp`.

## Good practices

- **Clear names and descriptions**: the agent decides with that. Say what he does, what he returns, and in what units.
- **Return data, not HTML**: small objects containing what the agent needs for its next step.
- **Return errors as values**: `return { error: '…' }`. Exception messages do not reach the agent.
- **Let the user see it**: Tools update the same interface that the person uses.

Click **View solution** (in the solution you will see `WebMCP: 5 exposed tools`) and compare your code to that of `retos/02-webmcp/solucion`.
