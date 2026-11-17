// Block 3 · Jev: quick and structured decisions.
// Jev does not generate text: answers questions about content (state) with data
// the code uses directly (an option, a score or a probability).
import { API_URL, TOKEN } from '../../../config.js'; // retos/config.js
import { todosLosProductos } from './tienda.js';

/** Sends content and multiple questions to Jev. Returns the answers by name. */
async function preguntarAJev(state, questions) {
  // TODO 1: make the request to the workshop's API.
  //   POST `${API_URL}/api/jev`
  //   Headers: Authorization: `Bearer ${TOKEN}` and Content-Type: application/json
  //   Cuerpo:    JSON.stringify({ state, questions })
  //   Returns `answers` from the answer. If the answer is not OK, launch an Error.
  throw new Error('Pending: Smart search is implemented in block 3 (src/jev.js).');
}

/**
 * Order the catalogue according to how well it fits with what the customer asks for.
 * Returns [{ producto, encaje }], with encaje between 0 and 1.
 */
export async function busquedaInteligente(peticion) {
  const productos = todosLosProductos();
  const NIVELES = ['Doesn\'t fit what you ask for.', 'Fits only partially', 'It fits very well with what you ask for'];

  // TODO 2: One single call to Jev with one question `score` per product.
  //   const questions = {}
  //   questions[producto.id] = {
  //     type: 'score',
  //     instructions: { tarea: 'How well does it fit…?', producto: { nombre, descripcion, categoria, precio_en_euros } },
  //     criteria: NIVELES,
  //   }
  //   const answers = await preguntarAJev({ peticion_del_cliente: peticion }, questions)
  //
  //   The score goes from 0 to 2 (the position in NIVELES).
  //   Put it at a value between 0 and 1, keep those who reach 0.5
  //   And order them from the top to the bottom.
  await preguntarAJev({ peticion_del_cliente: peticion }, {});
  return [];
}

/**
 * Decide if a review can be published and it puts note to it.
 * Returns { publicar: true, nota } or { publicar: false, motivo }.
 */
export async function moderarReseña(texto, producto) {
  // TODO 3: three questions in one call.
  //   inappropriate → issue: 'noul' do you contain insults, spam, advertising or personal data?
  //   tema        → type: 'choice'  criteria: { producto: '…', envio: '…', otro: '…' }
  //   note → line:'score's's bell: ['Very bad', 'Mala', 'Regular', 'Good', 'Very good']
  //
  //   Decide with numbers, without interpreting text:
  //   - Licht.inappropriate.noul > 0.5 → not published
  //   - Licht.tem. +44 0=== 'other' (and with high @) → is not published
  //   - note: Math.round(answers.note.score) + 1 → stars from 1 to 5
  //
  // As long as it is not implemented, reviews are published without review:
  return { publicar: true, nota: 3 };
}
