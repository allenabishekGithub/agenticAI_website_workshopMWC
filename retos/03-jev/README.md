---
title: Jev
bloque: 3
minutos: 15
resumen: Quick and structured decisions for the store, with a smart search that scores the catalog and a review moderator.
---

## Goal

Often you do not need a model to *write*: you need it to **decide**. Does this product match what the customer is looking for? Is this review spam? With a generative model, you would have to request JSON, wait, and cross your fingers.

**Jev** (from TypeSafe) answers questions about content using data your code can consume directly:

| Type | Question | Response |
| --- | --- | --- |
| `choice` | Choose an option | `choice: 'envio'`, `confidence`, `probabilities` |
| `score` | Rate on a scale | `score: 1.7` (weighted average of levels) |
| `noul` | Yes or no? | `noul: 0.93` (Yes probability) |

You will add two features to the shop: **smart search** and **review moderation**.

## Get started

```bash
cd retos/03-jev/inicio
npm install
npm run dev        # http://localhost:3003
```

At the top are two tabs: **Your code**, which uses the `inicio` folder you will edit, and **View solution** (`http://localhost:3003/solucion/`), which runs the `solucion` folder on the same server. Look at the solution before you start to see the expected result, or whenever you get stuck.

Paste the workshop token from the presentation into `retos/config.js`. All exercises share this file:

```js
export const TOKEN = 'paste-token-here';
```

Full API details are available at [/apis](/apis#jev).

## Steps

All the work is in `src/jev.js`.

### 1. The call to Jev

Complete `preguntarAJev(state, questions)`:

```js
const respuesta = await fetch(`${API_URL}/api/jev`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ state, questions }),
});

const datos = await respuesta.json();
if (!respuesta.ok) throw new Error(`Jev returned ${respuesta.status}`);
return datos.answers;
```

- `state`: the content you are asking about (text or object).
- `questions`: an object. Each key is the name you choose; the answer returns with that same key.

### 2. Smart Search

The customer writes ‘a gift for someone who works from home, under €60.’ Ask Jev **one `score` question per product, all in the same call**:

```js
questions[producto.id] = {
  type: 'score',
  instructions: {
    tarea: 'How well does this product match the customer\'s request? Consider the intended use and budget.',
    producto: { nombre, descripcion, categoria, precio_en_euros: precio },
  },
  criteria: ['Doesn\'t fit what you ask for.', 'Fits only partially', 'It fits very well with what you ask for'],
};
```

`answers[producto.id].score` ranges from `0` to `2`. Normalize it to `0–1`, filter, and sort. Notice the time displayed alongside the results: twelve decisions in a single call.

### 3. Moderate reviews

Before publishing a review, ask three questions in one call:

```js
{
  inapropiada: { type: 'noul', instructions: 'Does the review contain insults, spam, advertising or personal data?' },
  tema: {
    type: 'choice',
    instructions: 'What\'s the review about?',
    criteria: {
      producto: 'Discusses the product, its quality, or its use',
      envio: 'Discusses only shipping or delivery',
      otro: 'It has no relation to the product or purchase',
    },
  },
  nota: { type: 'score', instructions: 'How does the customer rate the product?',
          criteria: ['Very bad', 'Bad', 'Average', 'Good', 'Very good'] },
}
```

Then the code makes decisions using numbers:

```js
if (answers.inapropiada.noul > 0.5) return { publicar: false, motivo: 'contains inappropriate content' };
```

Try it: open a product and write an ordinary review, one containing advertising, and one about football.

### 4. Extra: smart search as a WebMCP tool

Connect sections 2 and 3: register `busqueda_inteligente` in `src/webmcp.js` so a browser agent can request recommendations. Use `interfaz.mostrarRecomendados(lista, peticion)` so the user can see the results.

## What you learn

- **No text parsing**: no `JSON.parse` and no ‘answer only yes or no’ prompts.
- **Probabilities, not just answers**: choose a threshold (`> 0.5`, `> 0.9`…) based on the cost of making a mistake.
- **Multiple questions per call** about the same content.
- Use it to classify, route, moderate, rank, or validate. Writing text still requires a generative model.

Stuck? Click **View solution**, with the token already pasted in, and compare your code with `retos/03-jev/solucion`.
