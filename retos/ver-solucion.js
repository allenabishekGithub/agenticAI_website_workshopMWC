// The "View solution" tab for exercises 2, 3 and 4 (no touching this file).
// It is a Vite plugin: the home server/ also serves the../solution folder in /solution/
// and put a bar above the two pages to move from your code to the solution.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePath } from 'vite';

const ESTILOS = `
.reto-pestanas {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.25rem;
  width: min(100% - 2.5rem, 1180px);
  margin: 0 auto;
  padding-top: 0.9rem;
  border-bottom: 1px solid #262626;
  font: 0.8rem/1.4 ui-monospace, 'Geist Mono', SFMono-Regular, Menlo, monospace;
}
.reto-pestanas a {
  margin-bottom: -1px;
  padding: 0.45rem 0.9rem;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  color: #8f8f8f;
  text-decoration: none;
}
.reto-pestanas a:hover {
  color: #ededed;
}
.reto-pestanas a[aria-current='page'] {
  border-color: #262626;
  background: #0a0a0a;
  color: #ededed;
}
.reto-pestanas a[href^='/solucion'][aria-current='page'] {
  border-top: 2px solid #ff3b30;
}
.reto-pestanas code {
  margin-left: auto;
  padding-bottom: 0.45rem;
  color: #8f8f8f;
}
`;

// On the rapporteur's computer you do not need to paste the token: if retos/config.js does not have it,
// WORKSHOP_TOKEN is used for.dev.vars (as well as the tester). Attendees do not have that file.
async function tokenDelPonente(raiz) {
  try {
    const variables = await readFile(path.join(raiz, '.dev.vars'), 'utf8');
    return variables.match(/^WORKSHOP_TOKEN\s*=\s*["']?([^"'\s]+)/m)?.[1] ?? '';
  } catch {
    return '';
  }
}

export function verSolucion() {
  let reto; // exercises/<challenge>
  let solucion; // absolute route of../solution
  let configuracion; // absolute route of retos/config.js

  return {
    name: 'ver-solucion',
    apply: 'serve',

    configResolved(config) {
      solucion = path.resolve(config.root, '../solucion');
      reto = path.basename(path.dirname(solucion));
      configuracion = normalizePath(path.resolve(config.root, '../../config.js'));
    },

    async transform(code, id) {
      if (normalizePath(id.split('?')[0]) !== configuracion) return;
      const vacio = /export const TOKEN = (['"`])\1;/;
      if (!vacio.test(code)) return;

      const token = await tokenDelPonente(path.resolve(configuracion, '../..'));
      if (token) return code.replace(vacio, `export const TOKEN = ${JSON.stringify(token)};`);
    },

    configureServer(server) {
      // Vite serves any project file with the prefix /@fs/ + its absolute path
      const carpeta = `/@fs/${solucion.replaceAll('\\', '/').replace(/^\//, '')}/`;

      server.middlewares.use(async (req, res, next) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        if (pathname === '/solucion') {
          res.writeHead(302, { Location: '/solucion/' }).end();
          return;
        }
        if (pathname !== '/solucion/' && pathname !== '/solucion/index.html') return next();

        try {
          // The index.html solution, with /src/... pointing to the../solution files
          const html = (await readFile(path.join(solucion, 'index.html'), 'utf8'))
            .replaceAll('="/src/', `="${carpeta}src/`)
            .replaceAll('href="/"', 'href="/solucion/"')
            .replace('<title>', '<title>Solution · ');

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(await server.transformIndexHtml('/solucion/index.html', html, req.originalUrl));
        } catch (error) {
          next(error);
        }
      });
    },

    transformIndexHtml(html, { path: ruta }) {
      const enSolucion = ruta.startsWith('/solucion/');
      const actual = (activa) => (activa ? ' aria-current="page"' : '');

      return [
        { tag: 'style', children: ESTILOS, injectTo: 'head' },
        {
          tag: 'nav',
          attrs: { class: 'reto-pestanas', 'aria-label': 'Code being executed' },
          children:
            `<a href="/"${actual(!enSolucion)}>Your code</a>` +
            `<a href="/solucion/"${actual(enSolucion)}>View solution</a>` +
            `<code>exercises/${reto}/${enSolucion ? 'solucion' : 'inicio'}</code>`,
          injectTo: 'body-prepend',
        },
      ];
    },
  };
}
