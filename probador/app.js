// Tester: a chat with a model that uses the MCP server tools, and below them
// tools to call them by hand. If they have a view (MCP Apps), paint it.
// Without SDK: MCP by HTTP is a Post with JSON-RPC, and a view is a message box that speaks for postMessage.
import { marked } from '/marked.js';

// In /solution/, the tester speaks with the server of the solution folder (the "View Solution" tab)
const SOLUCION = location.pathname.startsWith('/solucion/');
const ENDPOINT = SOLUCION ? '/solucion/mcp' : '/mcp';
const MODELO = 'gpt-6-luna';

const $ = (selector) => document.querySelector(selector);

/** Create an element: h('p', { className: 'x' }, 'texto', otroElemento) */
function h(etiqueta, propiedades = {}, ...hijos) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...hijos.filter((hijo) => hijo != null && hijo !== false && hijo !== ''));
  return $elemento;
}

/* ~ ~ ~ ~ Customer MCP minimum ~ ~ ~ ~ ~ */

let ultimoId = 0;

async function mcp(method, params = {}, endpoint = ENDPOINT) {
  const id = ++ultimoId;
  const respuesta = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const texto = await respuesta.text();
  const tipo = respuesta.headers.get('content-type') ?? '';

  // The response arrives as JSON or SSE events ("data: {…}")
  const mensajes = tipo.includes('text/event-stream')
    ? texto.split('\n').filter((linea) => linea.startsWith('data:')).map((linea) => JSON.parse(linea.slice(5)))
    : tipo.includes('json')
      ? [JSON.parse(texto)]
      : [];

  const mensaje = mensajes.find((m) => m.id === id) ?? mensajes.find((m) => m.error);
  if (!mensaje) throw new Error(`HTTP ${respuesta.status}`);
  if (mensaje.error) throw new Error(mensaje.error.message);
  return mensaje.result;
}

/* ~ ~ ~ ~ Form of each tool (from its inputSchema) ~ ~ ~ ~ ~ ~ */

const esNumero = (esquema) => ['number', 'integer'].includes(esquema.type);

// 'for example "Barça", "Atleti"...' → 'Barça'
const ejemplo = (descripcion = '') => descripcion.match(/por ejemplo "([^"]+)"/)?.[1] ?? '';

function campo(nombre, esquema, requerido) {
  const valor = String(esquema.default ?? (requerido ? ejemplo(esquema.description) : ''));

  const $control = esquema.enum
    ? h(
        'select',
        { name: nombre },
        !requerido && h('option', { value: '' }, '—'),
        ...esquema.enum.map((opcion) => h('option', { value: opcion }, opcion)),
      )
    : h('input', {
        name: nombre,
        type: esNumero(esquema) ? 'number' : 'text',
        step: esquema.type === 'integer' ? '1' : 'any',
        required: requerido,
        autocomplete: 'off',
        spellcheck: false,
      });

  if (valor) $control.value = valor;
  $control.title = esquema.description ?? '';
  return h('label', {}, h('span', {}, nombre), $control);
}

function leerArgumentos($form, esquema) {
  const argumentos = {};
  for (const [nombre, propiedad] of Object.entries(esquema?.properties ?? {})) {
    const valor = $form.querySelector(`[name="${CSS.escape(nombre)}"]`).value.trim();
    if (valor !== '') argumentos[nombre] = esNumero(propiedad) ? Number(valor) : valor;
  }
  return argumentos;
}

function pintarHerramienta(herramienta) {
  const { name, description, inputSchema } = herramienta;
  const requeridos = inputSchema?.required ?? [];
  const $resultado = h('div', { className: 'resultado', hidden: true });
  const $boton = h('button', { type: 'submit' }, 'Probar ▸');

  const $form = h(
    'form',
    {},
    h('code', { className: 'nombre' }, name),
    ...Object.entries(inputSchema?.properties ?? {}).map(([nombre, esquema]) =>
      campo(nombre, esquema, requeridos.includes(nombre)),
    ),
    $boton,
  );

  $form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    $boton.disabled = true;
    await probar(herramienta, leerArgumentos($form, inputSchema), $resultado);
    $boton.disabled = false;
  });

  return h('li', { className: 'herramienta' }, $form, h('p', { className: 'descripcion muted' }, description ?? ''), $resultado);
}

/* ~  Call a tool and paint what returns ~ */

const textoDe = ({ content = [] } = {}) => content.map((bloque) => bloque.text ?? `[${bloque.type}]`).join('\n');

async function leerVista(uri) {
  try {
    const { contents } = await mcp('resources/read', { uri });
    return contents?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

async function probar(herramienta, argumentos, $resultado) {
  // If there was a view of a previous call, stop listening to it
  $resultado.vista?.abort();
  $resultado.vista = new AbortController();
  $resultado.hidden = false;
  $resultado.replaceChildren(h('p', { className: 'meta muted' }, 'Llamando…'));

  const inicio = performance.now();
  let resultado;
  try {
    resultado = await mcp('tools/call', { name: herramienta.name, arguments: argumentos });
  } catch (error) {
    resultado = { isError: true, content: [{ type: 'text', text: error.message }] };
  }
  const milisegundos = Math.round(performance.now() - inicio);

  const uri = herramienta._meta?.ui?.resourceUri;
  const html = uri && !resultado.isError ? await leerVista(uri) : null;

  const $meta = h(
    'p',
    { className: 'meta' },
    resultado.isError ? h('span', { className: 'error' }, '✕ isError') : h('span', { className: 'ok' }, '✓ ok'),
    h('span', { className: 'muted' }, `${milisegundos} ms`),
    uri && h('code', { className: html ? 'muted' : 'error' }, html ? uri : `${uri} not registered`),
  );

  const $texto = h('pre', {}, textoDe(resultado) || '(no text)');
  const $datos =
    resultado.structuredContent &&
    h('details', {}, h('summary', {}, 'structuredContent'), h('pre', {}, JSON.stringify(resultado.structuredContent, null, 2)));

  const $partes = html
    ? [montarVista(html, argumentos, resultado, $resultado.vista.signal), h('details', {}, h('summary', {}, 'content'), $texto)]
    : [$texto];

  // Without structuredContent, $data is a 760 (and replaceChildren would paint it as text)
  $resultado.replaceChildren($meta, ...$partes, ...($datos ? [$datos] : []));
}

/* ~ ~ ~ ~ MCP Apps client minimum: view in an isolated frame ~ ~ ~ ~ ~ */

// Variables of style that the customer shares with the view: the colors of the workshop website
const ESTILOS = {
  '--color-background-primary': '#0a0a0a',
  '--color-background-secondary': '#111111',
  '--color-text-primary': '#ededed',
  '--color-text-secondary': '#8f8f8f',
  '--color-border-tertiary': '#262626',
  '--font-sans': 'ui-monospace, SFMono-Regular, Menlo, monospace',
  '--border-radius-md': '6px',
};

// In chat, what the view tells the model (alContexto) or writes in chat (alMensaje) actually comes
function montarVista(html, argumentos, resultado, signal, { alContexto, alMensaje } = {}) {
  const $iframe = h('iframe', { title: 'View', srcdoc: html });
  $iframe.setAttribute('sandbox', 'allow-scripts allow-forms');

  // What the view asks the client, to see that every step works
  const $eventos = h('ul', { className: 'eventos' });
  const anotar = (metodo, detalle) => $eventos.append(h('li', {}, h('code', {}, metodo), h('span', {}, detalle)));

  const enviar = (mensaje) => $iframe.contentWindow?.postMessage({ jsonrpc: '2.0', ...mensaje }, '*');

  const peticiones = {
    'ui/initialize': ({ protocolVersion }) => ({
      protocolVersion,
      hostInfo: { name: 'probador', version: '1.0.0' },
      hostCapabilities: {
        serverTools: {},
        serverResources: {},
        logging: {},
        openLinks: {},
        updateModelContext: { text: {} },
        message: { text: {} },
      },
      hostContext: {
        theme: 'dark',
        displayMode: 'inline',
        availableDisplayModes: ['inline'],
        platform: 'web',
        locale: 'en-GB',
        styles: { variables: ESTILOS },
      },
    }),
    'tools/call': (params) => {
      anotar('tools/call', `${params.name} ${JSON.stringify(params.arguments ?? {})}`);
      return mcp('tools/call', params);
    },
    'resources/read': (params) => mcp('resources/read', params),
    'ui/update-model-context': (params) => {
      anotar('ui/update-model-context', textoDe(params));
      alContexto?.(textoDe(params));
      return {};
    },
    'ui/message': (params) => {
      anotar('ui/message', textoDe(params));
      alMensaje?.(textoDe(params));
      return {};
    },
    'ui/open-link': ({ url }) => {
      window.open(url, '_blank', 'noopener');
      return {};
    },
    ping: () => ({}),
  };

  const notificaciones = {
    // View is ready: we passed the arguments and the result of the tool
    'ui/notifications/initialized': () => {
      enviar({ method: 'ui/notifications/tool-input', params: { arguments: argumentos } });
      enviar({ method: 'ui/notifications/tool-result', params: resultado });
    },
    'ui/notifications/size-changed': ({ height }) => {
      if (height) $iframe.style.height = `${Math.ceil(height) + 2}px`;
    },
    'notifications/message': ({ level, data }) =>
      anotar(`log · ${level}`, typeof data === 'string' ? data : JSON.stringify(data)),
  };

  window.addEventListener(
    'message',
    async ({ source, data }) => {
      if (source !== $iframe.contentWindow || data?.jsonrpc !== '2.0' || !data.method) return;
      const { id, method, params = {} } = data;

      if (id === undefined) {
        notificaciones[method]?.(params);
        return;
      }

      try {
        if (!peticiones[method]) throw new Error(`Tester can't stand ${method}`);
        enviar({ id, result: await peticiones[method](params) });
      } catch (error) {
        enviar({ id, error: { code: -32603, message: error.message } });
      }
    },
    { signal },
  );

  return h('div', { className: 'resultado' }, $iframe, $eventos);
}

/* ~    Server tools (change each time you decompose a step) ~    */

const $estado = $('#estado');
let nombreServidor = 'MCP';
let herramientas = null; // No request yet

async function actualizarHerramientas() {
  let tools;
  try {
    ({ tools } = await mcp('tools/list'));
  } catch (error) {
    // Offline (server is restarting when saving): it stays what had
    if (error instanceof TypeError) return herramientas ?? [];
    // Without registered tools, the server doesn't even understand tools/list
    tools = [];
  }

  // It only paints again if something has changed, so as not to erase what you have already tried
  if (JSON.stringify(tools) === JSON.stringify(herramientas)) return herramientas;
  herramientas = tools;

  $estado.textContent = tools.length
    ? `${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`
    : 'No tools yet.';
  $('#herramientas').replaceChildren(...tools.map(pintarHerramienta));

  $('#disponibles').replaceChildren(
    ...(tools.length
      ? ['The model can use: ', ...tools.flatMap(({ name }, i) => [i ? ', ' : '', h('code', {}, name)])]
      : ['The model has no tools: it only knows what it learned when training.']),
  );
  return tools;
}

/* ~: Chat: the model decides which tools to use and the tester calls them ~ */

// The model communicates through the workshop's OpenAI proxy (Responses API), using the workshop token
let configuracion;

const chat = {
  historial: [], // what the model is sent on each round: messages, tool calls and their results
  contexto: '', // what the view tells the model with ui/update-model-context
  vistas: new AbortController(),
  ocupado: false,
};

const MAX_VUELTAS = 6; // times in a row that the model can ask for tools before responding

// A MCP tool is almost as a function for the model: name, description and JSON Schema
const aFuncion = ({ name, description, inputSchema }) => ({
  type: 'function',
  name,
  description: description ?? '',
  parameters: inputSchema ?? { type: 'object', properties: {} },
  strict: false,
});

async function llamarAlModelo(tools) {
  configuracion ??= await fetch('/chat.json').then((respuesta) => respuesta.json());
  if (!configuracion.token) throw new Error('The token from the workshop is missing: stick it in retos/config.js.');

  const hoy = new Date().toLocaleDateString('en-GB', { dateStyle: 'full', timeZone: 'Europe/Madrid' });
  const instrucciones = [
    `You are an assistant connected to the MCP server "${nombreServidor}Today is the day ${hoy}.`,
    'Answer in English and a few sentences. You can use the markdown.',
    'For any current data (Nicarties, classifications, prices, stock...) use only the tools. ' +
      'If you don\'t have a tool to give you that data, say it clearly: don\'t make it up or respond with what you remember from your training.',
    chat.contexto && `What the user is now seeing in the interface: ${chat.contexto}`,
  ];

  const respuesta = await fetch(configuracion.api, {
    method: 'POST',
    headers: { Authorization: `Bearer ${configuracion.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      reasoning: { effort: 'low' },
      store: false,
      instructions: instrucciones.filter(Boolean).join('\n'),
      input: chat.historial,
      tools: tools.length ? tools.map(aFuncion) : undefined,
    }),
  });

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error?.message ?? `The model has responded with a ${respuesta.status}`);
  return datos.output ?? [];
}

const textoDelModelo = (output) =>
  output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((parte) => parte.type === 'output_text')
    .map((parte) => parte.text)
    .join('');

// The model's ticking down, not letting him in HTML
marked.use({ renderer: { html: () => '' } });

const $mensajes = $('#mensajes');
const $pensando = $('#pensando');
const $pregunta = $('#pregunta');

function añadir($elemento) {
  $mensajes.append($elemento);
  $elemento.scrollIntoView({ block: 'nearest' });
}

function pintarRespuesta(texto) {
  const $respuesta = h('li', { className: 'asistente' });
  $respuesta.innerHTML = marked.parse(texto);
  añadir($respuesta);
}

/** The model asks for a tool: the tester calls it on the MCP server and returns the text */
async function usarHerramienta({ call_id, name, arguments: json }, tools) {
  chat.historial.push({ type: 'function_call', call_id, name, arguments: json });

  let argumentos = {};
  const inicio = performance.now();
  let resultado;
  try {
    argumentos = JSON.parse(json || '{}');
    resultado = await mcp('tools/call', { name, arguments: argumentos });
  } catch (error) {
    resultado = { isError: true, content: [{ type: 'text', text: error.message }] };
  }
  const milisegundos = Math.round(performance.now() - inicio);

  chat.historial.push({ type: 'function_call_output', call_id, output: textoDe(resultado) || '(no text)' });

  const uri = tools.find((tool) => tool.name === name)?._meta?.ui?.resourceUri;
  const html = uri && !resultado.isError ? await leerVista(uri) : null;

  añadir(
    h(
      'li',
      { className: 'llamada' },
      h(
        'p',
        { className: 'meta' },
        resultado.isError ? h('span', { className: 'error' }, '✕') : h('span', { className: 'ok' }, '✓'),
        h('code', {}, `${name}(${Object.keys(argumentos).length ? JSON.stringify(argumentos) : ''})`),
        h('span', { className: 'muted' }, `${milisegundos} ms`),
      ),
      html &&
        montarVista(html, argumentos, resultado, chat.vistas.signal, {
          alContexto: (texto) => (chat.contexto = texto),
          alMensaje: enviarAlChat,
        }),
      h('details', {}, h('summary', {}, 'What the Model Receives'), h('pre', {}, textoDe(resultado) || '(no text)')),
    ),
  );
}

async function conversar(texto) {
  chat.ocupado = true;
  $pregunta.elements.texto.disabled = true;
  $('#nueva').disabled = true;
  $pensando.hidden = false;

  añadir(h('li', { className: 'usuario' }, texto));
  chat.historial.push({ role: 'user', content: texto });

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      // On each return, the tools that the server has right now
      const tools = await actualizarHerramientas();
      const output = await llamarAlModelo(tools);

      const respuesta = textoDelModelo(output);
      if (respuesta) {
        chat.historial.push({ role: 'assistant', content: respuesta });
        pintarRespuesta(respuesta);
      }

      const llamadas = output.filter((item) => item.type === 'function_call');
      if (llamadas.length === 0) break;
      for (const llamada of llamadas) await usarHerramienta(llamada, tools);
    }
  } catch (error) {
    añadir(h('li', { className: 'error' }, `✕ ${error.message}`));
  } finally {
    chat.ocupado = false;
    $pensando.hidden = true;
    $('#nueva').disabled = false;
    $pregunta.elements.texto.disabled = false;
    $pregunta.elements.texto.focus();
  }
}

// Queue: the "Ask the Wizard" button in a view can write while the model still responds
let cola = Promise.resolve();
function enviarAlChat(texto) {
  cola = cola.then(() => conversar(texto));
  return cola;
}

$pregunta.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const texto = $pregunta.elements.texto.value.trim();
  if (!texto || chat.ocupado) return;
  $pregunta.reset();
  enviarAlChat(texto);
});

$('#nueva').addEventListener('click', () => {
  chat.vistas.abort();
  Object.assign(chat, { historial: [], contexto: '', vistas: new AbortController() });
  $mensajes.replaceChildren();
  $pregunta.elements.texto.focus();
});

/* ~     "Your Code" and "See a Solution" tabs ~     */

// Only appear if the server has a solution (the exercises yes; the direct no)
async function mostrarPestañas(inicializar) {
  const $pestanas = $('#pestanas');
  const tieneSolucion = SOLUCION || (await mcp('initialize', inicializar, '/solucion/mcp').then(() => true, () => false));
  if (!tieneSolucion) return;

  for (const $pestana of $pestanas.querySelectorAll('a')) {
    if ($pestana.pathname === location.pathname) $pestana.setAttribute('aria-current', 'page');
  }
  $pestanas.hidden = false;
}

/* ───────────── Arranque ───────────── */

const INICIALIZAR = {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'probador', version: '1.0.0' },
};

mostrarPestañas(INICIALIZAR);

$('#endpoint').textContent = `${location.host}${ENDPOINT}`;
$('#modelo').textContent = `· ${MODELO}`;
$pensando.textContent = `${MODELO} is thinking…`;

try {
  const { serverInfo } = await mcp('initialize', INICIALIZAR);
  nombreServidor = serverInfo.name;
  $('#servidor').replaceChildren(serverInfo.name, ' ', h('small', {}, serverInfo.version));
  document.title = `${SOLUCION ? 'Solution · ' : ''}${serverInfo.name} · MCP tester`;

  await actualizarHerramientas();
  // Upon returning from the editor after decoupling a step, the list is up to date
  window.addEventListener('focus', actualizarHerramientas);
} catch (error) {
  $estado.textContent = `The server does not respond: ${error.message}`;
  $estado.className = 'error';
}
