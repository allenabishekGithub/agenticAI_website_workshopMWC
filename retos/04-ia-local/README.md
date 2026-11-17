---
title: Local AI on the web
bloque: 4
minutos: 17
resumen: Summarize each product's reviews with a model running in the browser, without sending data off the device.
---

## Goal

Each product's **Summarize reviews locally** button will use a model running **in the user's browser**:

- **Private**: reviews stay on the device.
- **No cost per request**: no server or API key.
- **Offline**: once the model has been downloaded, it even works on a plane.

Two approaches:

| Approach | What it is | Drawback |
| --- | --- | --- |
| **Chrome's built-in APIs** | Gemini Nano inside the browser: `Summarizer`, `LanguageModel`, `Translator`… | Desktop Chrome only, with hardware requirements |
| **WebGPU + Transformers.js** | You choose and download the model; it runs on the GPU | The user downloads hundreds of MB |

## Get started

```bash
cd retos/04-ia-local/inicio
npm install
npm run dev        # http://localhost:3004
```

At the top are two tabs: **Your code**, which uses the `inicio` folder you will edit, and **View solution** (`http://localhost:3004/solucion/`), which runs the `solucion` folder on the same server. Look at the solution before you start to see the expected result, or whenever you get stuck.

Check what your browser supports in the DevTools console:

```js
'Summarizer' in self && (await Summarizer.availability({ outputLanguage: 'en' }));
// 'available' | 'downloadable' | 'downloading' | 'unavailable'
```

> Gemini Nano requirements: desktop Chrome, 22 GB of free disk space, and a GPU with more than 4 GB of VRAM, or 16 GB of RAM and four CPU cores. If you get `unavailable`, go to step 4: the Transformers.js fallback works in any modern browser.

In **Your code**, the **Summarize reviews locally** button does not work yet: it tells you what is missing. In **View solution**, it already works.

## Steps

All the work is in `src/ia-local.js`.

### 1. Is it available?

Complete `disponibilidad()`:

```js
if (!('Summarizer' in self)) return 'unavailable';
return Summarizer.availability({ outputLanguage: 'en' });
```

### 2. Create the summarizer

```js
const summarizer = await Summarizer.create({
  type: 'tldr',              // 'key-points' | 'tldr' | 'teaser' | 'headline'
  format: 'plain-text',      // 'markdown' | 'plain-text'
  length: 'short',           // 'short' | 'medium' | 'long'
  expectedInputLanguages: ['en'],
  outputLanguage: 'en',
  sharedContext: 'Customer reviews from an online store.',
  monitor(monitor) {
    monitor.addEventListener('downloadprogress', (evento) => {
      alProgresar?.(Math.round(evento.loaded * 100));
    });
  },
});
```

The first time, Chrome downloads the model once for all websites. That is why `create()` requires a user click first.

### 3. Stream the summary

```js
let texto = '';
const stream = summarizer.summarizeStreaming(textoDeReseñas(producto), {
  context: `Product opinions "${producto.nombre}".`,
});

for await (const trozo of stream) {
  texto += trozo;
  alEscribir?.(texto);
}

return { texto, motor: 'Gemini Nano · Chrome Summarizer API' };
```

Open a product and click the button. Then disconnect Wi-Fi and try again.

### 4. Plan B: Transformers.js

Complete `resumirConTransformers()`. It uses the same pattern—load the model, then stream the generated output—with a library instead of a browser API:

```js
const { pipeline, TextStreamer } = await import(/* @vite-ignore */ TRANSFORMERS_JS);

// WebGPU if there is GPU; if not, WebAssembly (slower)
const gpu = await navigator.gpu?.requestAdapter().catch(() => null);
const device = gpu ? 'webgpu' : 'wasm';
// Quantization: about 470 MB instead of 3 GB, slightly less quality
const dtype = gpu?.features.has('shader-f16') ? 'q4f16' : 'q4';

// The model is downloaded and loaded once only
generador ??= await pipeline('text-generation', MODELO_WEBGPU, {
  device,
  dtype,
  progress_callback(progreso) {
    if (progreso.status === 'progress_total') alProgresar?.(Math.round(progreso.progress));
  },
});

let texto = '';
const streamer = new TextStreamer(generador.tokenizer, {
  skip_prompt: true,
  skip_special_tokens: true,
  callback_function(trozo) {
    texto += trozo;
    alEscribir?.(texto);
  },
});

const salida = await generador(
  [
    {
      role: 'system',
      content:
        'Customer reviews from an online store. Answer in English with a single sentence in this form: «Customers value..., though...». First what they like best and, after «though», the main complaint. Use only what the reviews say.',
    },
    { role: 'user', content: `Product: ${producto.nombre}\n\nReviews:\n${textoDeReseñas(producto)}` },
  ],
  { max_new_tokens: 120, do_sample: false, repetition_penalty: 1.05, streamer },
);

return {
  texto: salida[0].generated_text.at(-1).content.trim(),
  motor: `Qwen3.5 0.8B · Transformers.js (${device})`,
};
```

Qwen3.5 0.8B is a multilingual model with 800 million parameters, among the better models that fit in a reasonable download. Compare its summary with Gemini Nano's: it sometimes mixes up or invents details. Gemma 4 E2B writes better, but requires about 3 GB. **That is the limitation**: with local AI, the user bears the cost of the model's size.

### 5. Extra: JSON guaranteed with the Prompt API

Implement `prosYContras()` with `LanguageModel` and `responseConstraint`: provide a JSON Schema, and the model can only respond in that shape.

```js
const respuesta = await sesion.prompt('Extracts strengths and weaknesses:.', {
  responseConstraint: {
    type: 'object',
    properties: {
      pros: { type: 'array', items: { type: 'string' } },
      contras: { type: 'array', items: { type: 'string' } },
    },
    required: ['pros', 'contras'],
  },
});

JSON.parse(respuesta);
```

### 6. Extra: the summary as a WebMCP tool

Register `resumir_resenas` in `src/webmcp.js`. A browser agent requests the summary, and **the user's browser** generates it locally rather than in the cloud.

## Local or cloud?

| | Local | Cloud |
| --- | --- | --- |
| Privacy | Data does not leave the device | Traveling to a third party |
| Cost | Zero per request | Per token |
| Offline | Yes | No |
| Quality | Small models: narrowly scoped tasks | The best models |
| First time | Model download | Immediate |
| Compatibility | Depends on browser and hardware | Any device |

**Rule of thumb**: use local AI for small, frequent tasks on user data, such as summarizing, translating, correcting, or classifying. Use the cloud when you need reasoning, a lot of context, or consistent behavior across devices. Always provide a fallback.

## The complete application

`retos/04-ia-local/solucion`, shown in the **View solution** tab, is the shop with all four pieces:

- **MCP UI**: the catalog inside the chat (`retos/01-mcp-ui/solucion`).
- **WebMCP**: seven tools and a form for browser agents.
- **Jev**: smart search and review moderation.
- **Local AI**: on-device review summaries.
