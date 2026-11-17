// Pack the view (HTML + CSS + JS) in a single document HTML.
// MCP clients display view in an isolated inlay, without access to files
// external, so everything has to travel within HTML itself.
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const carpeta = new URL('../vista/', import.meta.url);

export async function crearVista() {
  const [html, css, resultado] = await Promise.all([
    readFile(new URL('index.html', carpeta), 'utf8'),
    readFile(new URL('estilos.css', carpeta), 'utf8'),
    build({
      entryPoints: [new URL('app.js', carpeta).pathname],
      bundle: true,
      format: 'esm',
      minify: true,
      write: false,
    }),
  ]);

  // Prevents a "</script>" within the code from closing the label ahead of time
  const js = resultado.outputFiles[0].text.replaceAll('</script', '<\\/script');

  return html
    .replace('<!-- ESTILOS -->', () => `<style>${css}</style>`)
    .replace('<!-- SCRIPT -->', () => `<script type="module">${js}</script>`);
}
