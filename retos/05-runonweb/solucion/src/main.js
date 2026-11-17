// Store interface. No need to touch this file during the workshop:
// The work of each block is in webmcp.js, jev.js and ia-local.js.
import { resumirReseñas } from './ia-local.js';
import { busquedaInteligente, moderarReseña } from './jev.js';
import {
  añadirAlCarrito,
  añadirReseña,
  buscarProductos,
  categorias,
  filtrar,
  filtros,
  obtenerProducto,
  quitarDelCarrito,
  tienda,
  vaciarCarrito,
  verCarrito,
} from './tienda.js';
import { registrarHerramientas } from './webmcp.js';

const $ = (selector, raiz = document) => raiz.querySelector(selector);

const $filtros = $('#filtros');
const $inteligente = $('#inteligente');
const $productos = $('#productos');
const $estado = $('#estado');
const $lineas = $('#lineas');
const $total = $('#total');
const $detalle = $('#detalle');
const $contenido = $('#detalle-contenido');
const $ofertas = $('#ofertas');

const euros = (cantidad) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cantidad);

/** Create an element: h('p', { className: 'x' }, 'texto', otroElemento) */
function h(etiqueta, propiedades = {}, ...hijos) {
  const $elemento = Object.assign(document.createElement(etiqueta), propiedades);
  $elemento.append(...hijos.filter((hijo) => hijo !== null && hijo !== undefined && hijo !== false));
  return $elemento;
}

/** Last intelligent search results: [{ product, lace }] or */
let recomendados = null;

// • Catalogue •

function pintarProductos() {
  const lista = recomendados ?? buscarProductos(filtros).map((producto) => ({ producto }));

  if (!recomendados) {
    $estado.textContent = `${lista.length} ${lista.length === 1 ? 'product' : 'products'}`;
  }

  $productos.replaceChildren(
    ...lista.map(({ producto, encaje }) =>
      h(
        'li',
        { className: 'producto' },
        // Photo opens product tab
        h(
          'button',
          { type: 'button', className: 'foto', ariaLabel: `View ${producto.nombre}`, onclick: () => abrirDetalle(producto.id) },
          h('img', { src: producto.imagen, alt: '', width: 560, height: 560 }),
          encaje !== undefined && h('span', { className: 'encaje' }, `Encaje: ${Math.round(encaje * 100)} %`),
          h('span', { className: 'valoracion' }, `★ ${producto.valoracion}`),
        ),
        h('div', { className: 'titulo' }, h('h3', {}, producto.nombre), h('strong', {}, euros(producto.precio))),
        h('p', { className: 'descripcion' }, producto.descripcion),
        h('button', { type: 'button', className: 'añadir', onclick: () => añadirAlCarrito(producto.id) }, 'Add to cart'),
      ),
    ),
  );
}

function pintarFiltros() {
  $filtros.texto.value = filtros.texto ?? '';
  $filtros.categoria.value = filtros.categoria ?? '';
  $filtros.precioMaximo.value = filtros.precioMaximo ?? '';
}

$filtros.addEventListener('input', () => {
  recomendados = null;
  filtrar({
    texto: $filtros.texto.value,
    categoria: $filtros.categoria.value,
    precioMaximo: Number($filtros.precioMaximo.value) || undefined,
  });
});

$filtros.addEventListener('submit', (evento) => evento.preventDefault());

// • Cart • • • • • • • • • • • • • • • • • • • • • • • • • • • 

function pintarCarrito() {
  const { lineas, total } = verCarrito();

  $lineas.replaceChildren(
    ...(lineas.length
      ? lineas.map((linea) =>
          h(
            'li',
            {},
            h('img', { src: linea.imagen, alt: '', width: 40, height: 40 }),
            h('span', {}, `${linea.cantidad} × ${linea.nombre}`),
            h('span', {}, euros(linea.subtotal)),
            h('button', { type: 'button', ariaLabel: `Quitar ${linea.nombre}`, onclick: () => quitarDelCarrito(linea.id) }, '×'),
          ),
        )
      : [h('li', { className: 'vacio' }, 'There\'s nothing yet.')]),
  );
  $total.textContent = euros(total);
}

$('#vaciar').addEventListener('click', () => vaciarCarrito());

// • Block 3 · Intelligent search with Jev ~       

$inteligente.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const $boton = $('button', $inteligente);
  const peticion = $inteligente.peticion.value.trim();

  $boton.disabled = true;
  $estado.textContent = 'Jev is deciding.';
  const inicio = performance.now();

  try {
    recomendados = await busquedaInteligente(peticion);
    const milisegundos = Math.round(performance.now() - inicio);
    $estado.textContent = `${recomendados.length} recommended for "${peticion}» · ${milisegundos} ms`;
    pintarProductos();
  } catch (error) {
    $estado.textContent = error.message;
  } finally {
    $boton.disabled = false;
  }
});

// Product details: reviews, local summary and moderation ~   

function abrirDetalle(id) {
  const producto = obtenerProducto(id);

  const $reseñas = h(
    'ul',
    { className: 'reseñas' },
    ...producto.reseñas.map((reseña, indice) =>
      h(
        'li',
        { style: `--i: ${indice}` },
        h('p', { className: 'autor' }, `${reseña.autor} · ${'★'.repeat(reseña.nota)}`),
        h('p', {}, reseña.texto),
      ),
    ),
  );
  const $resumen = h('div', { className: 'resumen', role: 'status' });
  const $resumir = h('button', { type: 'button' }, 'Summarize reviews in local');
  const $verReseñas = h(
    'button',
    { type: 'button', className: 'ver-reseñas', hidden: true },
    `View the ${producto.reseñas.length} reviews`,
  );

  // Block 4 · AI in the browser: reviews are based on a summary made on the device
  $resumir.addEventListener('click', async () => {
    $resumir.disabled = true;
    $verReseñas.hidden = true;
    restaurarReseñas($reseñas);
    $reseñas.classList.add('leyendo');
    $resumen.ariaBusy = 'true';
    $resumen.replaceChildren('Preparing the model.');

    // The model can go faster than animation: we keep what was generated and write it at our own pace
    const salida = { texto: '', terminada: false };
    const $texto = h('p');
    let efecto;
    const fundirYEscribir = () =>
      (efecto ??= (async () => {
        $resumen.replaceChildren(`Resumiendo ${producto.reseñas.length} reviews…`);
        await fundirReseñas($reseñas, $resumen);
        $resumen.replaceChildren($texto);
        await escribir($texto, salida);
      })());

    try {
      const { texto, motor } = await resumirReseñas(producto, {
        alProgresar: (porcentaje) =>
          efecto ||
          $resumen.replaceChildren(
            porcentaje < 100 ? `Downloading the model. ${porcentaje} %` : 'Loading the model…',
            h('progress', { max: 100, value: porcentaje }),
          ),
        alEscribir: (parcial) => {
          salida.texto = parcial.trimStart();
          fundirYEscribir();
        },
      });
      salida.texto = texto;
      salida.terminada = true;
      await fundirYEscribir();
      $resumen.append(h('small', {}, `— ${motor}`));
      $verReseñas.hidden = !$reseñas.hidden;
    } catch (error) {
      salida.terminada = true;
      await efecto?.catch(() => {});
      restaurarReseñas($reseñas);
      $resumen.replaceChildren(error.message);
    } finally {
      $reseñas.classList.remove('leyendo');
      $resumen.ariaBusy = 'false';
      $resumir.disabled = false;
    }
  });

  $verReseñas.addEventListener('click', () => {
    $verReseñas.hidden = true;
    separarReseñas($reseñas);
  });

  const $aviso = h('p', { className: 'estado', role: 'status' });
  const $formulario = h(
    'form',
    { className: 'nueva-reseña' },
    h('label', {}, h('span', {}, 'Your name'), h('input', { name: 'autor', required: true, autocomplete: 'off' })),
    h('label', {}, h('span', {}, 'Your review'), h('textarea', { name: 'texto', rows: 3, required: true })),
    h('button', { type: 'submit' }, 'Post review'),
    $aviso,
  );

  // Block 3 · Jev decides whether the review is published
  $formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const $boton = $('button', $formulario);
    const autor = $formulario.autor.value.trim();
    const texto = $formulario.texto.value.trim();

    $boton.disabled = true;
    $aviso.textContent = 'Reviewing the review.';
    try {
      const decision = await moderarReseña(texto, producto);
      if (!decision.publicar) {
        $aviso.textContent = `Not published: ${decision.motivo}.`;
        return;
      }
      añadirReseña(producto.id, { autor, nota: decision.nota, texto });
      abrirDetalle(producto.id);
    } catch (error) {
      $aviso.textContent = error.message;
    } finally {
      $boton.disabled = false;
    }
  });

  $contenido.replaceChildren(
    h(
      'div',
      { className: 'ficha' },
      h('img', { src: producto.imagen, alt: '', width: 560, height: 560 }),
      h(
        'div',
        {},
        h('h2', {}, producto.nombre),
        h('p', { className: 'suave' }, producto.descripcion),
        h('p', { className: 'precio' }, h('strong', {}, euros(producto.precio)), h('span', {}, `★ ${producto.valoracion}`)),
      ),
    ),
    h('h3', {}, `Reviews (${producto.reseñas.length})`),
    $resumir,
    $resumen,
    $verReseñas,
    $reseñas,
    h('h3', {}, 'Write a review'),
    $formulario,
  );

  if (!$detalle.open) $detalle.showModal();
}

// • Effect of the summary: the reviews are based on it ~     

const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');

/** Each review flies to the summary and dissolves inside; then the empty list folds */
async function fundirReseñas($lista, $destino) {
  $lista.classList.remove('leyendo');
  if (menosMovimiento.matches) return;

  const destino = $destino.getBoundingClientRect();
  const vuelos = [...$lista.children].map(($reseña, indice) => {
    const origen = $reseña.getBoundingClientRect();
    const x = destino.x + destino.width / 2 - (origen.x + origen.width / 2);
    const y = destino.y + destino.height / 2 - (origen.y + origen.height / 2);
    return $reseña.animate(
      [
        { transform: 'none', opacity: 1, filter: 'blur(0)' },
        { opacity: 0.9, filter: 'blur(1px)', offset: 0.6 },
        { transform: `translate(${x}px, ${y}px) scale(0.2)`, opacity: 0, filter: 'blur(6px)' },
      ],
      { duration: 650, delay: indice * 90, easing: 'cubic-bezier(0.55, 0, 0.45, 1)', fill: 'forwards' },
    );
  });
  await Promise.all(vuelos.map((vuelo) => vuelo.finished));

  $destino.animate([{ boxShadow: '0 0 0 0 rgb(255 59 48 / 0.5)' }, { boxShadow: '0 0 0 12px rgb(255 59 48 / 0)' }], {
    duration: 600,
    easing: 'ease-out',
  });
  await $lista.animate([{ height: `${$lista.offsetHeight}px` }, { height: '0px' }], { duration: 250, easing: 'ease-in' })
    .finished;
  $lista.hidden = true;
}

/** The opposite: reviews come out of the summary and go back to your site */
async function separarReseñas($lista) {
  const vuelos = $lista.getAnimations({ subtree: true });
  $lista.hidden = false;
  $lista.animate([{ height: '0px' }, { height: `${$lista.offsetHeight}px` }], { duration: 250, easing: 'ease-out' });
  for (const vuelo of vuelos) vuelo.reverse();
  await Promise.all(vuelos.map((vuelo) => vuelo.finished));
  restaurarReseñas($lista);
}

function restaurarReseñas($lista) {
  for (const animacion of $lista.getAnimations({ subtree: true })) animacion.cancel();
  $lista.hidden = false;
}

/** Write the text letter to letter as it arrives, until the model ends */
async function escribir($elemento, salida) {
  $elemento.className = 'escribiendo';
  let letras = 0;
  while (!salida.terminada || letras < salida.texto.length) {
    letras = Math.min(letras + 1, salida.texto.length);
    $elemento.textContent = salida.texto.slice(0, letras);
    await new Promise(requestAnimationFrame);
  }
  $elemento.className = '';
}

// • Offers (form also exposed to agents) • • • • • • • • • • • • • • • • • • • • • • • •

$ofertas.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const mensaje = `We will notify you at ${$ofertas.email.value} of tenders for ${$ofertas.categoria.value}.`;
  $('#ofertas-estado').textContent = mensaje;

  // WebMCP: If the form has been sent by an agent, we will return the result
  if (evento.agentInvoked) evento.respondWith(Promise.resolve(mensaje));
});

// ── Arranque ──────────────────────────────────────────────────────────────

for (const categoria of categorias) {
  $filtros.categoria.append(h('option', { value: categoria }, categoria));
}

tienda.addEventListener('cambio', () => {
  pintarFiltros();
  pintarProductos();
  pintarCarrito();
});

pintarProductos();
pintarCarrito();

// Section 2 · WebMCP
const herramientas = await registrarHerramientas({
  abrirDetalle,
  mostrarRecomendados(lista, peticion) {
    recomendados = lista;
    $estado.textContent = `${lista.length} recommended for "${peticion}» (search for an agent)`;
    pintarProductos();
  },
  ocultarRecomendados() {
    recomendados = null;
  },
});

const $agente = $('#agente');
$agente.hidden = false;
$agente.textContent = herramientas.length
  ? `WebMCP: ${herramientas.length} exposed tools`
  : 'WebMCP: no tools';
