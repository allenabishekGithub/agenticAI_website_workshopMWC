import { defineConfig } from 'vite';
import { verSolucion } from '../../ver-solucion.js'; // retos/ver-solucion.js

// The "See Solution" tab: in /solution/ the../solution folder is executed with this same server
export default defineConfig({
  plugins: [verSolucion()],
});
