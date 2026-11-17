// View Code: runs within the field shown by the MCP client.
import { App } from '@modelcontextprotocol/ext-apps';

const $productos = document.querySelector('#productos');
const $titulo = document.querySelector('#titulo');
const $carrito = document.querySelector('#carrito');
const $estado = document.querySelector('#estado');

const app = new App({ name: 'Catálogo de la tienda', version: '1.0.0' });

const euros = (cantidad) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cantidad);

function pintarProductos(productos) {
  $titulo.textContent = `${productos.length} ${productos.length === 1 ? 'product' : 'products'}`;
  $estado.textContent = productos.length === 0 ? 'There are no products matching the search.' : '';

  $productos.replaceChildren(
    ...productos.map((producto) => {
      const $item = document.createElement('li');
      $item.className = 'product';
      $item.innerHTML = `
        <span class="emoji" aria-hidden="true"></span>
        <span class="nombre"></span>
        <p class="descripcion"></p>
        <div class="pie">
          <span class="precio"></span>
          <button class="añadir" type="button">Add</button>
        </div>`;
      $item.querySelector('.emoji').textContent = producto.emoji;
      $item.querySelector('.nombre').textContent = producto.nombre;
      $item.querySelector('.descripcion').textContent = producto.descripcion;
      $item.querySelector('.precio').textContent = `${euros(producto.precio)} · ★ ${producto.valoracion}`;
      $item.querySelector('button').addEventListener('click', (evento) => añadir(producto, evento.currentTarget));
      return $item;
    }),
  );
}

function pintarCarrito(carrito) {
  $carrito.textContent = `Cart · ${carrito.unidades} · ${euros(carrito.total)}`;
}

async function añadir(producto, $boton) {
  $boton.disabled = true;
  try {
    // 3. View calls another server tool through client
    const resultado = await app.callServerTool({
      name: 'anadir_al_carrito',
      arguments: { id: producto.id, cantidad: 1 },
    });
    pintarCarrito(resultado.structuredContent);
    $estado.textContent = `${producto.nombre} added to cart.`;

    // 4. We alert the model of what the user has done in the interface
    await app.updateModelContext({
      content: [{ type: 'text', text: `The user has added "${producto.nombre}" to the cart from the interface.` }],
    });
  } catch (error) {
    $estado.textContent = `Could not close temporary folder: %s ${error.message}`;
  } finally {
    $boton.disabled = false;
  }
}

// 2. The client sends us the result of the tool that has opened this view
app.addEventListener('toolresult', (resultado) => {
  const { productos, carrito } = resultado.structuredContent ?? {};
  if (productos) pintarProductos(productos);
  if (carrito) pintarCarrito(carrito);
});

// The Cart button asks the wizard to continue the conversation
$carrito.addEventListener('click', () => {
  app.sendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'Show me the cart and tell me the total.' }],
  });
});

// 1. We connect with the customer (always after registering events)
await app.connect();
