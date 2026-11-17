// Block 2 · WebMCP: the web displays its features as tools.
// A browser agent calls them directly, without reading the screen or simulating clicks.
import { resumirReseñas } from './ia-local.js';
import { busquedaInteligente } from './jev.js';
import {
  añadirAlCarrito,
  categorias,
  filtrar,
  obtenerProducto,
  vaciarCarrito,
  verCarrito,
} from './tienda.js';

/**
 * Register the tools in the store. Returns the names of registered ones.
 * `interfaz` are main.js functions for the user to see what the agent does.
 */
export async function registrarHerramientas(interfaz) {
  // The API lives in the old version of the modelContext (in old versions, navigator.modelContext)
  const modelContext = document.modelContext ?? navigator.modelContext;

  if (!modelContext) {
    console.info('WebMCP is unavailable. Enable it at chrome://flags/#enable-webmcp-testing');
    return [];
  }

  const herramientas = [
    {
      name: 'buscar_productos',
      description:
        'Search for products in the shop catalogue by text, category and maximum price. Return id, name, price in euros and valuation. The search is also displayed to the user on screen.',
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
    },
    {
      name: 'ver_producto',
      description: 'Returns the detail of a product, including customer reviews, and opens it on screen.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Product identifier, for example "mochila-viaje"' } },
        required: ['id'],
      },
      // The reviews are written by users: the agent should not trust them
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute({ id }) {
        const producto = obtenerProducto(id);
        interfaz.abrirDetalle(id);
        return producto;
      },
    },
    {
      name: 'anadir_al_carrito',
      description: 'Add units of a product to your cart. Return the updated cart with the total in euros.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Product identifier' },
          cantidad: { type: 'integer', minimum: 1, maximum: 10, description: 'Units to add (1 default)' },
        },
        required: ['id'],
      },
      execute({ id, cantidad = 1 }) {
        return añadirAlCarrito(id, cantidad);
      },
    },
    {
      name: 'ver_carrito',
      description: 'Return the products in the cart, the units and the total in euros.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        return verCarrito();
      },
    },
    {
      name: 'vaciar_carrito',
      description: 'Remove all products from the cart. Unable to undo.',
      inputSchema: { type: 'object', properties: {} },
      // Action with consequences: the browser can ask for confirmation from the user
      annotations: { consequentialHint: true },
      execute() {
        return vaciarCarrito();
      },
    },
    {
      name: 'busqueda_inteligente',
      description:
        'Recommends products based on a need expressed in natural language (use, recipient, budget). Returns the products ordered by lace, from 0 to 1.',
      inputSchema: {
        type: 'object',
        properties: {
          peticion: { type: 'string', description: 'What the customer needs, for example "something to travel light"' },
        },
        required: ['peticion'],
      },
      annotations: { readOnlyHint: true },
      async execute({ peticion }) {
        const recomendados = await busquedaInteligente(peticion);
        interfaz.mostrarRecomendados(recomendados, peticion);
        return recomendados.map(({ producto, encaje }) => ({ ...producto, encaje: Number(encaje.toFixed(2)) }));
      },
    },
    {
      name: 'resumir_resenas',
      description:
        'Impress product reviews with a model running in the user\'s browser. The first time may take because you download the model.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Product identifier' } },
        required: ['id'],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute({ id }) {
        const { texto } = await resumirReseñas(obtenerProducto(id));
        return { id, resumen: texto };
      },
    },
  ];

  const registradas = [];

  for (const herramienta of herramientas) {
    const { execute } = herramienta;

    await modelContext.registerTool({
      ...herramienta,
      // Errors are returned as value: the message of an exception does not reach the agent
      async execute(parametros) {
        try {
          return await execute(parametros);
        } catch (error) {
          return { error: error.message };
        }
      },
    });

    registradas.push(herramienta.name);
  }

  return registradas;
}
