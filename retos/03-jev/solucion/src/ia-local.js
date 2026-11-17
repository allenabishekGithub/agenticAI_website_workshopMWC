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
  // TODO 1: Check if the browser has the API Summarizer.
  //   - If it does not exist ('Summar kerries' in self), returns 'un.
  //   - If it exists, return await Summarizer.availability({ outputLanguage: 'en' })
  return 'unavailable';
}

async function resumirConChrome(producto, { alProgresar, alEscribir }) {
  // TODO 2: Creates the summary.
  //   const summarizer = await Summarizer.create({
  //     type: 'tldr', format: 'plain-text', length: 'short',
  //     expectedInputLanguages: ['en'], outputLanguage: 'en',
  //     sharedContext: 'Customer reviews from an online store.',
  //     monitor(monitor) {
  //       // event. RANTED ranges from 0 to 1 → alProgresar?.(percentage)
  //       monitor.addEventListener('downloadprogress', (evento) => { … })
  //     },
  //   })
  //
  // TODO 3: summarizes in streaming so that the text appears as generated.
  //   const stream = summarizer.summarizeStreaming(textoDeReseñas(producto), { context: '…' })
  //   for await (const trozo of stream) { texto += trozo; alEscribir?.(texto) }
  //
  // Return { texto, motor: 'Gemini Nano · Chrome Summarizer API' }
  throw new Error('Pending: the API summary of Chrome is implemented in block 4 (src/ia-local.js).');
}

// • Plan B: a small model with Transformers.js ~ ~ ~ ~ ~ ~ ~ ~ ~
// For browsers without integrated AI. It is the same pattern (load model →
// generate on streaming) with a library instead of a native API.

/** The model is loaded once and reused */
let generador;

async function resumirConTransformers(producto, { alProgresar, alEscribir }) {
  // TODO 4: Summarizes with Transformers.js.
  //   const { pipeline, TextStreamer } = await import(/* @vite-ignore */ TRANSFORMERS_JS)
  //
  //   WebGPU if there is GPU; if not, WebAssembly (slower). With the Tober-f16 model weighs less:
  //   const gpu = await navigator.gpu?.requestAdapter().catch(() => null)
  //   const device = gpu ? 'webgpu' : 'wasm'
  //   const dtype = gpu?.features.has('shader-f16') ? 'q4f16' : 'q4'
  //
  //   generador ??= await pipeline('text-generation', MODELO_WEBGPU, {
  //     device, dtype,
  //     // progreso.status === 'progress_total' → alProgresar?.(Math.round(progreso.progress))
  //     progress_callback(progreso) { … },
  //   })
  //
  //   The text is received by the runner as it is generated:
  //   const streamer = new TextStreamer(generador.tokenizer, {
  //     skip_prompt: true, skip_special_tokens: true,
  //     callback_function(trozo) { texto += trozo; alEscribir?.(texto) },
  //   })
  //
  //   const salida = await generador([
  //     { role: 'system', content: 'The first sentence of the report states that "customers value..., although..."' },
  //     { role: 'user', content: `Product: ${producto.nombre}\n\nReviews:\n${textoDeReseñas(producto)}` },
  //   ], { max_new_tokens: 120, do_sample: false, repetition_penalty: 1.05, streamer })
  //
  // Return { texto: salida[0].generated_text.at(-1).content.trim(), motor: `Qwen3.5 0.8B · Transformers.js (${device})` }
  throw new Error('Pending: the summary with Transformers.js is implemented in block 4 (src/ia-local.js).');
}

/**
 * TODO 5 (extra): draws strengths and weaknesses like JSON with the Prompt API.
 *   - LanguageModel.availability(opciones) and LanguageModel.create(opciones)
 *   - session.prompt(text, {responseConstraint: <JSON Schema> }) forces the model
 *     to respond in the form { pros: string[], contras: string[] }
 *   - The answer comes as text: JSON.parse(response)
 */
export async function prosYContras(producto) {
  throw new Error('Slope: extra block 4.');
}
