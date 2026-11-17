// Tester: A web to check a MCP server from the browser.
// directo/liga and retos/01-mcp-ui servers serve it in everything that is not /mcp.
// In /solution/ it is the same website, but talk to /solucion/mcp (the "View solution" tab of the exercises).
import { readFile } from 'node:fs/promises';
import { API_URL, TOKEN } from '../retos/config.js';

const ARCHIVOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/solucion/': ['index.html', 'text/html; charset=utf-8'],
  '/probador.css': ['estilos.css', 'text/css; charset=utf-8'],
  '/probador.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/marked.js': ['../node_modules/marked/lib/marked.esm.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['../public/favicon.svg', 'image/svg+xml'],
  '/fuentes/mono.woff2': ['../src/assets/fonts/GeistMono-Latin.woff2', 'font/woff2'],
  '/fuentes/pixel.woff2': ['../src/assets/fonts/GeistPixel-Square-Latin.woff2', 'font/woff2'],
};

// The token of the chat workshop: the retos/config.js or, on the rapporteur's computer, the.dev.vars
async function tokenDelTaller() {
  if (TOKEN) return TOKEN;
  try {
    const variables = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8');
    return variables.match(/^WORKSHOP_TOKEN\s*=\s*["']?([^"'\s]+)/m)?.[1] ?? '';
  } catch {
    return '';
  }
}

export async function servirProbador(pathname, res) {
  // What the tester chat needs to talk to the model (the proxy from OpenAI from the workshop)
  if (pathname === '/chat.json') {
    const configuracion = { api: `${API_URL}/api/openai/v1/responses`, token: await tokenDelTaller() };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(configuracion));
    return;
  }

  const [ruta, tipo] = ARCHIVOS[pathname] ?? [];

  try {
    if (!ruta) throw new Error();
    const contenido = await readFile(new URL(ruta, import.meta.url));
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' }).end(contenido);
  } catch {
    res.writeHead(404).end('MCP server is in /mcp');
  }
}
