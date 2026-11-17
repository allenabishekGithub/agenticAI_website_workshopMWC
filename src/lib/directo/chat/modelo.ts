// Local chat (/directo/chat): the model and messages between the page and the iraet.

/** Qwen 3.5 0.8B: text and images, 202 languages and reasoning mode. OPT version is recommended for Transformers.js */
export const MODELO = 'onnx-community/Qwen3.5-0.8B-ONNX-OPT';
export const NOMBRE = 'Qwen 3.5 · 0.8B';

/**
 * Quantization. q4f16 requires `shader-f16` extension of WebGPU (~790 MB in total);
 * without it, q4 (~710 MB). The image encoder goes in fp16: in 4 bits it is much more wrong.
 */
export const DTYPE = {
  f16: { embed_tokens: 'q4f16', vision_encoder: 'fp16', decoder_model_merged: 'q4f16' },
  f32: { embed_tokens: 'q4', vision_encoder: 'q4', decoder_model_merged: 'q4' },
} as const;

/** Sampling recommended by Qwen for each mode (without reasoning/reasoning) */
export const MUESTREO = {
  directo: { temperature: 0.7, top_p: 0.8, top_k: 20 },
  razonando: { temperature: 0.6, top_p: 0.95, top_k: 20 },
};

export type Contenido = string | Array<{ type: 'image' } | { type: 'text'; text: string }>;

export interface MensajeChat {
  role: 'system' | 'user' | 'assistant';
  content: Contenido;
}

export type Peticion =
  | { tipo: 'cargar' }
  /** `imagenes`: data URLs, in the same order as the `{ type: 'image' }` parts in `mensajes` */
  | { tipo: 'generate'; id: string; mensajes: MensajeChat[]; imagenes: string[]; razonar: boolean }
  | { tipo: 'stop' };

export type Respuesta =
  | { estado: 'loading'; texto: string; progreso: number }
  | { estado: 'ready'; dispositivo: string }
  | { estado: 'error-carga'; error: string }
  | { estado: 'trozo'; id: string; texto: string }
  | { estado: 'fin'; id: string; tokens: number; tokensPorSegundo: number; milisegundos: number }
  | { estado: 'error'; id: string; error: string };
