// Block 2 · WebMCP: the web displays its features as tools.
// A browser agent calls them directly, without reading the screen or simulating clicks.
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
 * `interfaz` are main.js functions for the user to see what the agent does:
 *   interfaz.abrirDetalle(id)       → abre la ficha de un producto
 *   interfaz.ocultarRecomendados()  → vuelve al listado normal
 */
export async function registrarHerramientas(interfaz) {
  // TODO 1: Check that the browser has WebMCP.
  //   The API lives in the document.modelContext. If it does not exist, returns [] so that
  //   The store keeps running the same way it always does.
  const modelContext = undefined;

  if (!modelContext) {
    console.info('WebMCP is unavailable. Enable it at chrome://flags/#enable-webmcp-testing');
    return [];
  }

  const herramientas = [
    // Complete example: a read-only tool without parameters
    {
      name: 'ver_carrito',
      description: 'Return the products in the cart, the units and the total in euros.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute() {
        return verCarrito();
      },
    },

    // TODO 2: `buscar_productos` (text,  categoria, precioMaximo).
    //   - Agame well each parameter in inputSchema (is a JSON Schema).
    //     For the category use `enum: categorias`.
    //   - In quantil uses filter: returns the products and also
    //     update the screen for the user to see the search.
    //   - It is read only: annotations: { readOnlyHint: true }

    // TODO 3: `anadir_al_carrito` (id obligatorio, cantidad opcional).
    //   - Use añadirAlCarrito(id, cantidad) and return the updated cart.

    // TODO 4: `ver_producto` (id).
    //   - Use obtenerProducto(id) and interface.abrirDetalle(id).
    //   - Returns user-written reviews: mark it with
    //     annotations: { readOnlyHint: true, untrustedContentHint: true }

    // TODO 5: `vaciar_carrito`.
    //   - It cannot be undone: annotations: { consequentialHint: true }
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

// TODO 6 (API declarative): Open index.html and convert the offer form
// in an unwritten tool JavaScript:
//   <form id="ofertas" toolname="suscribir_ofertas" tooldescription="…">
//   and in each field: "Syrmparamde" (Syrmparamde)
