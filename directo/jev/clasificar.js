// Live: the first decision with Jev. Opens /directo/clasificar on the workshop website and decomments
// steps in order (select the lines of code for each step and press Cmd + /).
// The page is reloaded by itself when saving and works after each step.

// The workshop token (the page leaves it in a < meta>) and the workshop proxy, which adds the key to TypeSafe
const TOKEN = document.querySelector('meta[name="token-taller"]')?.content ?? '';
const API_JEV = '/api/jev';

// ~ ~ STEP 1 · A question: what is the message about? ~
// Jev does not write text: choose one of the options (+040) and give the probability of each.
// const preguntas = {
//   tema: {
//     type: 'choice',
//     instructions: 'What\'s the client\'s message about???.',
//     criteria: {
//       envio: 'Where the order is, delays or transportation',
//       devolucion: 'Return or change a product',
//       pago: 'Collections, invoices or reimbursements.',
//       producto: 'Doubts about a product',
//       spam: 'Advertising or nothing to do with the store',
//     },
//   },
// };
//
// export async function clasificar(mensaje) {
//   const respuesta = await fetch(API_JEV, {
//     method: 'POST',
//     headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
//     body: JSON.stringify({ state: mensaje, questions: preguntas }),
//   });
//
//   const datos = await respuesta.json();
//   if (!respuesta.ok) throw new Error(datos.error?.message ?? `Jev returned ${respuesta.status}`);
//   return datos.answers;
// }

// ~ ~ STEP 2 · More questions in the same name ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
// Yes or no (noul: the probability of 'yes') and a scale (score: weighted average of levels).
// urgent questions = { { { {: noul, }, wresles: 'Should we answer you today?' };
// preguntas.enfado = {
//   type: 'score',
//   instructions: 'How angry is the client?????.............................................:.?..?...??..??..??..?..??....??......????.....????????????????????????????',
//   criteria: ['Not at all', 'Somewhat annoyed', 'Very angry'],
// };

// • • STEP 3 · The code decides with numbers, without interpreting text • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • 
// export function decidir({ tema, urgente }) {
//   if (tema.choice === 'spam' && tema.confidence > 0.8) return 'To the trash can.';
//   if (urgente?.noul > 0.7) return `• equipment of ${tema.choice}`;
//   return `Team of ${tema.choice}`;
// }
