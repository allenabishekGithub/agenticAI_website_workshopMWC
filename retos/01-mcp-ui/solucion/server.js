import { createServer } from 'node:http';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import {
  NodeStreamableHTTPServerTransport,
  localhostHostValidation,
  localhostOriginValidation,
} from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { crearVista } from './lib/vista.js';
import { categorias } from './productos.js';
import { añadirAlCarrito, buscarProductos, verCarrito } from './tienda.js';
import { servirProbador } from '../../../probador/servir.js';

// View address. The ui:// schema indicates that it is a MCP Apps interface
const VISTA_CATALOGO = 'ui://tienda/catalogo.html';

export function crearServidor() {
  const server = new McpServer({ name: 'tienda', version: '1.0.0' });

  // 1. A tool with interface: in addition to text, it points to a resource ui://
  registerAppTool(
    server,
    'buscar_productos',
    {
      title: 'Search products',
      description:
        'Search for products in the shop catalog and display them in an interactive interface with button to add to the cart.',
      inputSchema: z.object({
        texto: z.string().optional().describe('Words to search for in name or description'),
        categoria: z.enum(categorias).optional().describe('Product category'),
        precioMaximo: z.number().positive().optional().describe('Maximum price in euros'),
      }),
      _meta: { ui: { resourceUri: VISTA_CATALOGO } },
    },
    async (filtros) => {
      const productos = buscarProductos(filtros);
      const carrito = verCarrito();

      return {
        // Text for the model (and for customers who do not display interfaces).
        content: [
          {
            type: 'text',
            text: productos.length
              ? productos.map((p) => `- ${p.nombre} (${p.id}): ${p.precio} €, ★ ${p.valoracion}`).join('\n')
              : 'There are no products matching the search.',
          },
        ],
        // Data for the view
        structuredContent: { productos, carrito },
      };
    },
  );

  // 2. The resource with the HTML interface
  registerAppResource(
    server,
    'Shop Catalog',
    VISTA_CATALOGO,
    { description: 'Product Grid with button to add to cart' },
    async () => ({
      contents: [{ uri: VISTA_CATALOGO, mimeType: RESOURCE_MIME_TYPE, text: await crearVista() }],
    }),
  );

  // 3. Normal tools: use the model and also the view (callServerTool)
  server.registerTool(
    'anadir_al_carrito',
    {
      title: 'Add to cart',
      description: 'Add a product to your shopping cart.',
      inputSchema: z.object({
        id: z.string().describe('Product identifier, for example "teclado-mecanico"'),
        cantidad: z.number().int().min(1).max(10).default(1).describe('Units to add'),
      }),
    },
    async ({ id, cantidad }) => {
      try {
        const carrito = añadirAlCarrito(id, cantidad);
        return {
          content: [{ type: 'text', text: `Added. The cart has ${carrito.unidades} units: ${carrito.total} €.` }],
          structuredContent: carrito,
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    },
  );

  server.registerTool(
    'ver_carrito',
    {
      title: 'View cart',
      description: 'Returns the products in the cart and the total amount.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const carrito = verCarrito();
      return {
        content: [
          {
            type: 'text',
            text: carrito.lineas.length
              ? `${carrito.lineas.map((l) => `- ${l.cantidad} × ${l.nombre}: ${l.subtotal} €`).join('\n')}\nTotal: ${carrito.total} €`
              : 'The cart is empty.',
          },
        ],
        structuredContent: carrito,
      };
    },
  );

  return server;
}

// Start only if you run this file: the View Solution tab matters the../solution without booting it
if (import.meta.main && process.argv.includes('--stdio')) {
  // For clients who start the server as a process (Claude Desktop, for example)
  await crearServidor().connect(new StdioServerTransport());
} else if (import.meta.main) {
  // HTTP server in http://localhost:3001/mcp
  const PUERTO = Number(process.env.PORT ?? 3001);
  const hostValido = localhostHostValidation();
  const origenValido = localhostOriginValidation();

  createServer(async (req, res) => {
    if (!hostValido(req, res) || !origenValido(req, res)) return;

    const { pathname } = new URL(req.url, 'http://localhost');

    // Out of /mcp, a web to test the server from the browser
    if (pathname !== '/mcp' && pathname !== '/solucion/mcp') {
      await servirProbador(pathname, res);
      return;
    }

    // No sessions: a server and a transport per request
    const transporte = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    // /solucion/mcp is the server of the fix folder: it is used by the "View Solution" tab of the tester
    const servidor = pathname === '/mcp' ? crearServidor() : (await import('../solucion/server.js')).crearServidor();
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res);
  }).listen(PUERTO, '127.0.0.1', () => {
    console.log(`MCP Store Server in http://localhost:${PUERTO}/mcp`);
    console.log(`http://localhost: tester${PUERTO} (and solution in http://localhost:${PUERTO}/solucion/)`);
  });
}
