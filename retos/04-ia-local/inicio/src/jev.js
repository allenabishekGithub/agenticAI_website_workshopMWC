// Block 3 · Jev: quick and structured decisions.
// Jev does not generate text: answers questions about content (state) with data
// the code uses directly (an option, a score or a probability).
import { API_URL, TOKEN } from '../../../config.js'; // retos/config.js
import { todosLosProductos } from './tienda.js';

/** Sends content and multiple questions to Jev. Returns the answers by name. */
async function preguntarAJev(state, questions) {
  const respuesta = await fetch(`${API_URL}/api/jev`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ state, questions }),
  });

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(`Jev returned ${respuesta.status}: ${datos.error?.message ?? JSON.stringify(datos.detail)}`);
  }
  return datos.answers;
}

/**
 * Order the catalogue according to how well it fits with what the customer asks for.
 * One single call with one `score` question per product.
 * Returns [{ producto, encaje }], with encaje between 0 and 1.
 */
export async function busquedaInteligente(peticion) {
  const productos = todosLosProductos();
  const NIVELES = ['Doesn\'t fit what you ask for.', 'Fits only partially', 'It fits very well with what you ask for'];

  const questions = {};
  for (const producto of productos) {
    questions[producto.id] = {
      type: 'score',
      instructions: {
        tarea: 'How well does this product match the customer\'s request? Consider the intended use and budget.',
        producto: {
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          categoria: producto.categoria,
          precio_en_euros: producto.precio,
        },
      },
      criteria: NIVELES,
    };
  }

  const answers = await preguntarAJev({ peticion_del_cliente: peticion }, questions);

  return productos
    .map((producto) => ({
      producto,
      // score ranges from 0 to the last level (2): normalize it to a value between 0 and 1
      encaje: answers[producto.id].score / (NIVELES.length - 1),
    }))
    .filter(({ encaje }) => encaje >= 0.5)
    .sort((a, b) => b.encaje - a.encaje);
}

/**
 * Decide if a review can be published and it puts note to it.
 * Three questions in a single call: noul (yes/no), choice (choose), and score (rate).
 * Returns { publicar, motivo, nota }.
 */
export async function moderarReseña(texto, producto) {
  const answers = await preguntarAJev(
    { producto: producto.nombre, reseña: texto },
    {
      inapropiada: {
        type: 'noul',
        instructions: 'Does the review contain insults, spam, advertising or personal data?',
      },
      tema: {
        type: 'choice',
        instructions: 'What\'s the review about?',
        criteria: {
          producto: 'Discusses the product, its quality, or its use',
          envio: 'Discusses only shipping or delivery',
          otro: 'It has no relation to the product or purchase',
        },
      },
      nota: {
        type: 'score',
        instructions: 'How does the customer rate the product?',
        criteria: ['Very bad', 'Bad', 'Average', 'Good', 'Very good'],
      },
    },
  );

  // Code decides with numbers, not interpreting text
  if (answers.inapropiada.noul > 0.5) {
    return { publicar: false, motivo: 'contains inappropriate content' };
  }
  if (answers.tema.choice === 'otro' && answers.tema.confidence > 0.6) {
    return { publicar: false, motivo: 'does not talk about the product' };
  }

  // score ranges from 0 to 4 → convert to 1–5 stars
  return { publicar: true, nota: Math.round(answers.nota.score) + 1 };
}
