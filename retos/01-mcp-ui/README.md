---
title: MCP UI
bloque: 1
minutos: 18
resumen: An MCP server for the shop that returns an interactive catalog inside the chat, alongside text.
---

## Goal

The shop's MCP server already has a `buscar_productos` tool, but it only returns text. You will turn it into an **MCP App**: the assistant displays a product grid inside the chat, with an Add to cart button that calls back to the server.

<figure class="flujo">
<div class="flujo-scroll">
<div class="flujo-grid">
  <div class="flujo-panel flujo-panel--cliente" aria-hidden="true"></div>
  <div class="flujo-panel flujo-panel--servidor" aria-hidden="true"></div>
  <p class="flujo-titulo flujo-tc"><strong>MCP client</strong> <span>chat · VS Code, Claude.</span></p>
  <p class="flujo-titulo flujo-ts"><strong>MCP server</strong> <span>the store · <code>server.js</code></span></p>
  <div class="flujo-c1">
    <p class="chat chat--usuario">find some audio equipment</p>
    <div class="chat chat--modelo">
      <p class="chat-quien">◆ model</p>
      <p>Searching the shop…</p>
      <p class="chat-tool"><code>buscar_productos({ categoria: 'audio' })</code></p>
    </div>
  </div>
  <div class="flujo-m flujo-m1">
    <span class="flujo-n">1</span>
    <p class="flecha flecha--ida"><code>tools/call</code></p>
    <p class="flecha flecha--vuelta"><code>text + data</code></p>
  </div>
  <div class="pieza flujo-s1">
    <p class="pieza-tipo">tool · <code>registerAppTool</code> <span class="todo">TODO 1</span></p>
    <p class="pieza-nombre"><code>buscar_productos</code></p>
    <p class="pieza-meta"><code>_meta.ui.resourceUri</code> <code class="uri">ui://tienda/catalogo.html</code></p>
    <dl>
      <dt><code>content</code></dt>
      <dd>text for the model</dd>
      <dt><code>structuredContent</code></dt>
      <dd>data for the view</dd>
    </dl>
  </div>
  <div class="iframe flujo-cv">
    <p class="iframe-barra"><span class="iframe-puntos" aria-hidden="true"></span> <code class="uri">ui://tienda/catalogo.html</code> <span class="iframe-tag">isolated iframe</span></p>
    <p class="flujo-nota"><span class="flujo-n">3</span> <span>The client paints the HTML and passes the data with <code>toolresult</code> <span class="todo">TODO 4</span></span></p>
    <ul class="iframe-productos">
      <li><span class="emoji">🎧</span> Headphones <b>149 €</b> <span class="boton boton--activo">Add</span></li>
      <li><span class="emoji">🎙️</span> Microphone <b>79 €</b> <span class="boton">Add</span></li>
      <li><span class="emoji">🔊</span> Speaker <b>59 €</b> <span class="boton">Add</span></li>
    </ul>
    <p class="flujo-nota"><span class="flujo-n">4</span> <span>The button calls the server with <code>app.callServerTool()</code> <span class="todo">TODO 5</span></span></p>
    <p class="iframe-carrito">Cart · 1 · €149</p>
  </div>
  <div class="flujo-m flujo-m2">
    <span class="flujo-n">2</span>
    <p class="flecha flecha--ida"><code>resources/read</code></p>
    <p class="flecha flecha--vuelta"><code>HTML</code></p>
  </div>
  <div class="pieza flujo-s2">
    <p class="pieza-tipo">resource · <code>registerAppResource</code> <span class="todo">TODO 2</span></p>
    <p class="pieza-nombre uri"><code>ui://tienda/catalogo.html</code></p>
    <p class="pieza-desc">The folder <code>vista/</code> packaged in a single HTML</p>
  </div>
  <div class="flujo-m flujo-m3">
    <span class="flujo-n">4</span>
    <p class="flecha flecha--ida"><code>callServerTool</code></p>
    <p class="flecha flecha--vuelta"><code>cart</code></p>
  </div>
  <div class="pieza flujo-s3">
    <p class="pieza-tipo">tool · <code>registerTool</code> <span class="todo">TODO 3</span></p>
    <p class="pieza-nombre"><code>anadir_al_carrito</code></p>
    <p class="pieza-desc"><code>{ id, cantidad }</code> → Cart. You can use the model... and also the view</p>
  </div>
  <p class="flujo-nota flujo-c5"><span class="flujo-n flujo-n--extra">5</span> <span><code>app.updateModelContext()</code> alerts the model of what the user has done <span class="todo">TODO 6 · extra</span></span></p>
</div>
</div>
<figcaption><span class="leyenda leyenda--ida">request</span> <span class="leyenda leyenda--vuelta">response</span> <span><span class="todo">TODO n</span> where you program it: 1–3 en <code>server.js</code>, 4–6 in <code>vista/app.js</code></span></figcaption>
</figure>

## Get started

```bash
cd retos/01-mcp-ui/inicio
npm install
npm run dev        # server in http://localhost:3001/mcp (restarts when saving)
```

Open `http://localhost:3001`: this is the **tester**, a webpage with a chat that uses your server's tools and a form underneath for calling each tool manually. If a tool has an interface, the tester displays it.

At the top are two tabs: **Your code**, using the `inicio` folder you will edit, and **View solution** (`http://localhost:3001/solucion/`), which talks to the server in `solucion` without starting anything else. Look at the solution before you start to see the expected result, or whenever you get stuck.

You can also check it from another terminal tab:

```bash
npm run probar
```

You will see the tools and a warning: none has an interface yet.

## Files

| File | What it is |
| --- | --- |
| `server.js` | The MCP server. **TODOs 1, 2, and 3 are here.** |
| `vista/app.js` | The interface's JavaScript. **TODOs 4, 5, and 6 are here.** |
| `vista/index.html`, `vista/estilos.css` | The interface's HTML and styles, already provided |
| `lib/vista.js` | Packages the view into a single HTML document, already provided |
| `tienda.js`, `productos.js` | Catalog and cart logic: ordinary JavaScript without MCP |

## Steps

### 1. A tool with an interface

In `server.js`, replace `server.registerTool` with `registerAppTool` and link the view using `_meta.ui.resourceUri`. Return the view's data in `structuredContent`:

```js
registerAppTool(
  server,
  'buscar_productos',
  {
    title: 'Search products',
    description: '…',
    inputSchema: z.object({ /* as before */ }),
    _meta: { ui: { resourceUri: VISTA_CATALOGO } },
  },
  async (filtros) => {
    const productos = buscarProductos(filtros);
    return {
      content: [{ type: 'text', text: '…' }],                  // for the model
      structuredContent: { productos, carrito: verCarrito() },  // for the view
    };
  },
);
```

> The text in `content` still matters: it is what the model reads and what clients without interface support display.

### 2. The resource containing the HTML

The tool points to `ui://tienda/catalogo.html`. Register that resource:

```js
registerAppResource(
  server,
  'Shop Catalog',
  VISTA_CATALOGO,
  { description: 'Product Grid with button to add to cart' },
  async () => ({
    contents: [{ uri: VISTA_CATALOGO, mimeType: RESOURCE_MIME_TYPE, text: await crearVista() }],
  }),
);
```

Run `npm run probar`: `buscar_productos` now has an interface.

### 3. The `anadir_al_carrito` tool

Create an ordinary tool with `server.registerTool`, accepting `id` and `cantidad`. Both the model and the view will use it. Return the cart in `structuredContent`, or `{ isError: true, … }` if the product does not exist.

### 4. The view receives the result

In `vista/app.js`, listen for the tool result and render the products:

```js
app.addEventListener('toolresult', (resultado) => {
  const { productos, carrito } = resultado.structuredContent ?? {};
  if (productos) pintarProductos(productos);
  if (carrito) pintarCarrito(carrito);
});
```

### 5. The view calls the server

Complete the `añadir` function using `app.callServerTool()` to make the button work.

### 6. Extra: notify the model

When the user adds something through the interface, the model does not automatically know. Notify it with `app.updateModelContext()`.

## Try it in a client

You need a client that supports MCP Apps. Here are three options:

**MCPJam Inspector**: the quickest option, with no account required:

```bash
npm run inspector
```

Add an HTTP server at `http://localhost:3001/mcp`, open the `buscar_productos` tool, and run it.

**VS Code**: create `.vscode/mcp.json` and ask the chat to ‘find headphones in the shop’:

```json
{
  "servers": {
    "tienda": { "type": "http", "url": "http://localhost:3001/mcp" }
  }
}
```

**Claude Desktop**: start the server as a process using `--stdio`. Add this to its MCP server configuration:

```json
{
  "mcpServers": {
    "tienda": {
      "command": "node",
      "args": ["/RUTA/ABSOLUTA/retos/01-mcp-ui/inicio/server.js", "--stdio"]
    }
  }
}
```

## What you learn

- An MCP tool can return **text for the model** and **data for an interface** at the same time.
- The interface is a `ui://` resource containing HTML that the client displays in a **sandboxed iframe**.
- Communication works both ways: `toolresult` (client → view) and `callServerTool` (view → server).

Stuck? Click **View solution** in the tester to see the expected result, and compare your code with `retos/01-mcp-ui/solucion`.
