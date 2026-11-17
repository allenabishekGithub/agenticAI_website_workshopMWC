import { createServer } from 'node:http';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import {
  NodeStreamableHTTPServerTransport,
  localhostHostValidation,
  localhostOriginValidation,
} from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { crearVista } from './lib/vista.js';
import { verClasificacion, verEquipo, verResultados } from './liga.js';
import { servirProbador } from '../../../probador/servir.js';

// Live: we move from the 1-mcp server finished. Uncheck steps in order
// (select the lines of code for each step and press Cmd + /).
// Steps 1–3 are in this file; steps 4–8 are in vista/app.js.

// The view address. The ui:// schema indicates that it is an interface of MCP Apps
const VISTA = 'ui://laliga/vista.html';

// Dates in Madrid time: "Sat, 22 Nov, 14:00"
const fecha = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });

const marcador = ({ local, visitante }) => `${local.nombre} ${local.goles}-${visitante.goles} ${visitante.nombre}`;

function crearServidor() {
  const server = new McpServer({ name: 'laliga', version: '1.0.0' });

  // Before: Server.registerTool('name',...). Now: registerAppTool(server, 'name',...).
  // It's the same, but understand _meta.ui: the tool interface.
  registerAppTool(
    server,
    'ver_clasificacion',
    {
      title: 'LaLiga Classification',
      description: 'Returns the current LaLiga rating: position, points, matches and goals of each team.',
      annotations: { readOnlyHint: true },
      _meta: {
        // • STEP 1 · The tool links your view (in the three tools) •
        // ui: { resourceUri: VISTA },
      },
    },
    async () => {
      const clasificacion = await verClasificacion();
      const filas = clasificacion.equipos.map(
        (e) =>
          `${e.posicion}. ${e.nombre}: ${e.puntos} pts · ${e.jugados} PJ · ${e.ganados}G ${e.empatados}E ${e.perdidos}P · ` +
          `${e.golesAFavor} GF, ${e.golesEnContra} GC${e.zona ? ` · ${e.zona}` : ''}`,
      );

      return {
        // Text for the model (and for customers who do not display interfaces).
        content: [{ type: 'text', text: `LaLiga Classification ${clasificacion.temporada}\n${filas.join('\n')}` }],
        // • STEP 2 · In addition to text, the view data (in the three tools) •
        // structuredContent: { clasificacion },
      };
    },
  );

  registerAppTool(
    server,
    'ver_resultados',
    {
      title: 'Results of the day',
      description: 'Returns the results of the matches from the last day of LaLiga.',
      annotations: { readOnlyHint: true },
      _meta: {
        // STEP 1
        // ui: { resourceUri: VISTA },
      },
    },
    async () => {
      const resultados = await verResultados();
      const filas = resultados.partidos.map((p) => `- ${fecha(p.fecha)}: ${marcador(p)}${p.estado === 'in' ? ' (in play)' : ''}`);

      return {
        content: [{ type: 'text', text: `Latest results from LaLiga\n${filas.join('\n')}` }],
        // STEP 2
        // structuredContent: { resultados },
      };
    },
  );

  registerAppTool(
    server,
    'ver_equipo',
    {
      title: 'Team details',
      description: 'Position in the table, last five results and next match of a LaLiga team.',
      inputSchema: z.object({
        equipo: z.string().describe('Name or nickname of the team, e.g. "Barça", "Atleti" or "real Society" '),
      }),
      annotations: { readOnlyHint: true },
      _meta: {
        // STEP 1
        // ui: { resourceUri: VISTA },
      },
    },
    async ({ equipo: texto }) => {
      try {
        const equipo = await verEquipo(texto);
        const { proximo } = equipo;

        const lineas = [
          `${equipo.nombre}: ${equipo.posicion}or in LaLiga ${equipo.temporada} with ${equipo.puntos} pts ` +
            `(${equipo.ganados}G ${equipo.empatados}E ${equipo.perdidos}P).`,
          'Latest matches (from the latest to the oldest).',
          ...equipo.ultimos.map((p) => `- ${p.resultado} · ${fecha(p.fecha)}: ${marcador(p)}`),
          proximo
            ? `Next match: ${proximo.local.nombre} - ${proximo.visitante.nombre}, ${fecha(proximo.fecha)} in ${proximo.estadio}.`
            : 'He doesn\'t have scheduled matches...............................................................?????...?????????....??????????????????????????????????????????????????????',
        ];

        return {
          content: [{ type: 'text', text: lineas.join('\n') }],
          // STEP 2
          // structuredContent: { equipo },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    },
  );

  // • • STEP 3 · The resource ui:// with the HTML of the hearing • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • • 
  // The three tools share the same view. It goes in a frame with a strict CSP:.
  // We must allow the CDN of shields.
  // registerAppResource(
  //   server,
  //   'LaLiga',
  //   VISTA,
  //   { description: 'LaLiga team leaderboards, results and team tiles' },
  //   async () => ({
  //     contents: [
  //       {
  //         uri: VISTA,
  //         mimeType: RESOURCE_MIME_TYPE,
  //         text: await crearVista(),
  //         _meta: { ui: { csp: { resourceDomains: ['https://a.espncdn.com'] } } },
  //       },
  //     ],
  //   }),
  // );

  return server;
}

if (process.argv.includes('--stdio')) {
  // For clients who start the server as a process (Claude Desktop, for example)
  await crearServidor().connect(new StdioServerTransport());
} else {
  // HTTP server in http://localhost:3102/mcp
  const PUERTO = Number(process.env.PORT ?? 3102);
  const hostValido = localhostHostValidation();
  const origenValido = localhostOriginValidation();

  createServer(async (req, res) => {
    if (!hostValido(req, res) || !origenValido(req, res)) return;

    const { pathname } = new URL(req.url, 'http://localhost');

    // Out of /mcp, a web to test the server from the browser
    if (pathname !== '/mcp') {
      await servirProbador(pathname, res);
      return;
    }

    // No sessions: a server and a transport per request
    const transporte = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await crearServidor().connect(transporte);
    await transporte.handleRequest(req, res);
  }).listen(PUERTO, '127.0.0.1', () => {
    console.log(`MCP server from LaLiga on http://localhost:${PUERTO}/mcp`);
    console.log(`http://localhost: tester${PUERTO}`);
  });
}
