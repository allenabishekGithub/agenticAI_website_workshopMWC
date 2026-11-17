// Block 4 · Local AI: The model is executed in the browser.
// Reviews do not leave the device, there is no cost per request and it works offline.

// Small model (about 470 MB) for browsers without integrated AI.
// Qwen3.5 0.8B: multilingual and 2026. Gemma 4 E2B writes better, but weighs about 3 GB.
const MODELO_WEBGPU = 'onnx-community/Qwen3.5-0.8B-Text-ONNX';
const TRANSFORMERS_JS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

const textoDeReseñas = (producto) =>
  producto.reseñas.map((reseña) => `${reseña.autor} (${reseña.nota}/5): ${reseña.texto}`).join('\n');

/**
 * Impress reviews of a product without leaving the browser.
 * Returns { texto, motor }.
 *   alProgresar(percentage) → Model download progress
 *   alEscribir(partial) → text generated so far (streaming)
 */
export async function resumirReseñas(producto, { alProgresar, alEscribir } = {}) {
  // 1. API integrated into Chrome (Gemini Nano)
  if ((await disponibilidad()) !== 'unavailable') {
    return resumirConChrome(producto, { alProgresar, alEscribir });
  }

  // 2. Plan B: a small model with Transformers.js (WebGPU, or WASM if there is no GPU)
  return resumirConTransformers(producto, { alProgresar, alEscribir });
}

/** Status of the API Summarizer: 'un560', 'downloadable', 'downloading' or '560' */
async function disponibilidad() {
  if (!('Summarizer' in self)) return 'unavailable';

  // If the browser doesn't answer in 3 seconds, we use plan B
  const espera = new Promise((resolve) => setTimeout(resolve, 3000, 'unavailable'));
  return Promise.race([Summarizer.availability({ outputLanguage: 'en' }), espera]).catch(() => 'unavailable');
}

async function resumirConChrome(producto, { alProgresar, alEscribir }) {
  const summarizer = await Summarizer.create({
    type: 'tldr',
    format: 'plain-text',
    length: 'short',
    expectedInputLanguages: ['en'],
    outputLanguage: 'en',
    sharedContext: 'Customer reviews from an online store.',
    monitor(monitor) {
      // The first time you have to download the model (solo once per browser)
      monitor.addEventListener('downloadprogress', (evento) => alProgresar?.(Math.round(evento.loaded * 100)));
    },
  });

  let texto = '';
  const stream = summarizer.summarizeStreaming(textoDeReseñas(producto), {
    context: `Product opinions "${producto.nombre}".`,
  });
  for await (const trozo of stream) {
    texto += trozo;
    alEscribir?.(texto);
  }

  summarizer.destroy();
  return { texto, motor: 'Gemini Nano · Chrome Summarizer API' };
}

/** The model is loaded once and reused */
let generador;

async function resumirConTransformers(producto, { alProgresar, alEscribir }) {
  const { pipeline, TextStreamer } = await import(/* @vite-ignore */ TRANSFORMERS_JS);

  // WebGPU if GPU is available; if not, WebAssembly (slower).
  // If the GPU calculates in half precision (shader-f16), the model weighs less: 470 MB instead of 550 MB
  const gpu = await navigator.gpu?.requestAdapter().catch(() => null);
  const device = gpu ? 'webgpu' : 'wasm';
  const dtype = gpu?.features.has('shader-f16') ? 'q4f16' : 'q4';

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
}

/**
 * Extra: draws strengths and weaknesses like JSON with the Prompt API.
 * `responseConstraint` forces the model to respond with a specific scheme.
 */
export async function prosYContras(producto) {
  const opciones = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };

  if (!('LanguageModel' in self) || (await LanguageModel.availability(opciones)) === 'unavailable') {
    throw new Error('The Prompt API is not available in this browser.');
  }

  const sesion = await LanguageModel.create({
    ...opciones,
    initialPrompts: [{ role: 'system', content: 'You analyze customer reviews from an online store.' }],
  });

  const respuesta = await sesion.prompt(`Extract strengths and weaknesses:${textoDeReseñas(producto)}`, {
    responseConstraint: {
      type: 'object',
      properties: {
        pros: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        contras: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      },
      required: ['pros', 'contras'],
    },
  });

  sesion.destroy();
  return JSON.parse(respuesta);
}
