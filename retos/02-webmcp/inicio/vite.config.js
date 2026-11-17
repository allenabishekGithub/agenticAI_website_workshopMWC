import { defineConfig } from 'vite';
import { asistente } from '../../asistente/plugin.js'; // retos/asistente
import { verSolucion } from '../../ver-solucion.js'; // retos/ver-solucion.js

// The "See Solution" tab: in /solution/ the../solution folder is executed with this same server.
// The wizard: a chat with gpt-6-moon that uses the WebMCP tools on the page.
export default defineConfig({
  plugins: [verSolucion(), asistente()],
});
