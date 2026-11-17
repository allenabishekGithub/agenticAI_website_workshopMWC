// The Store Wizard: a chat with gpt-6-moon that uses the WebMCP tools on the page
// (no need to touch this file). It is a Vite plugin: add chat.js to both tabs,
// "Your Code" and "View Solution", without touching the index.html or the main.js of the Challenge.
import { fileURLToPath } from 'node:url';

const CHAT = fileURLToPath(new URL('./chat.js', import.meta.url));

export function asistente() {
  return {
    name: 'asistente',
    apply: 'serve',

    transformIndexHtml() {
      // Vite serves any project file with the prefix /@fs/ + its absolute path
      const src = `/@fs/${CHAT.replaceAll('\\', '/').replace(/^\//, '')}`;
      return [{ tag: 'script', attrs: { type: 'module', src }, injectTo: 'body' }];
    },
  };
}
