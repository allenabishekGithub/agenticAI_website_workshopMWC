// Live: AI in local with runonweb. Opens /directo/runonweb on the workshop website and decomments
// steps in order (select the lines of code for each step and press Cmd + /).
// The page is reloaded by itself when saving and works after each step.

// runonweb (https://runonweb.ai) packs models running in the browser: one import per task.
// Each model is downloaded the first time and stays in the browser cache. Nothing leaves the device.

// The page paints the download of each model with these notices (no need to touch it)
const avisar = (paso) => (progreso) => dispatchEvent(new CustomEvent('runonweb', { detail: { paso, ...progreso } }));

// ~ ~ STEP 1 · Remove the fund ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
// BEN2 (~220 MB) separates the object from the background and returns a transparent PNG.
import { RemoveBackground } from 'runonweb/remove-bg';

const recortador = new RemoveBackground({ device: 'wasm', onProgress: avisar('fondo') });

export async function quitarFondo(foto) {
  return recortador.remove(foto); // BOB PNG with transparency
}

// ~ ~ STEP 2 · Describe the photo in English ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
// LFM2.5-VL 450M (~320 MB) looks at the image and writes; onPartial receives text as generated.
import { ImageCaptioner } from 'runonweb/caption';

const descriptor = new ImageCaptioner({ language: 'en', detail: 'detailed', onProgress: avisar('describir') });

export async function describir(foto, alEscribir) {
  const { text } = await descriptor.caption(foto, { onPartial: alEscribir });
  return text;
}

// ~ ~ STEP 3 · Read the description aloud ~       
// Supertonic 2 (~260 MB): text to voice in Spanish, English, French, Portuguese and Korean.
import { TextToSpeech } from 'runonweb/tts';

const voz = new TextToSpeech({ size: 'multi', voice: 'st_f1', language: 'en', onProgress: avisar('leer') });

export async function leer(texto) {
  return voz.speakToBlob(texto); // Blob WAV
}
