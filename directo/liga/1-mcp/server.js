import { createServer } from 'node:http';
import {
  NodeStreamableHTTPServerTransport,
  localhostHostValidation,
  localhostOriginValidation,
} from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { verClasificacion, verEquipo, verResultados } from './liga.js';
import { servirProbador } from '../../../probador/servir.js';

// Live: Uncheck the steps in order (select the lines of code for each step and press Cmd + /).
// The server restarts only when saving and works after each step.

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

  // ~  STEP 1 · The first tool: classification ~     
  // Name, description (the model decides with this if you use it) and a function that returns text.
  // server.registerTool(
  //   'ver_clasificacion',
  //   {
  //     title: 'LaLiga Classification',
  //     description: 'Returns the current LaLiga rating: position, points, matches and goals of each team.',
  //     annotations: { readOnlyHint: true },
  //   },
  //   async () => {
  //     const clasificacion = await verClasificacion();
  //     const filas = clasificacion.equipos.map(
  //       (e) =>
  //         `${e.posicion}. ${e.nombre}: ${e.puntos} pts · ${e.jugados} PJ · ${e.ganados}G ${e.empatados}E ${e.perdidos}P · ` +
  //         `${e.golesAFavor} GF, ${e.golesEnContra} GC${e.zona ? ` · ${e.zona}` : ''}`,
  //     );
  //
  //     return {
  //       content: [{ type: 'text', text: `LaLiga Classification ${clasificacion.temporada}\n${filas.join('\n')}` }],
  //     };
  //   },
  // );

  // • • STEP 2 · Another tool: the results of the last day • • • • • • • •
  // server.registerTool(
  //   'ver_resultados',
  //   {
  //     title: 'Results of the day',
  //     description: 'Returns the results of the matches from the last day of LaLiga.',
  //     annotations: { readOnlyHint: true },
  //   },
  //   async () => {
  //     const resultados = await verResultados();
  //     const filas = resultados.partidos.map((p) => `- ${fecha(p.fecha)}: ${marcador(p)}${p.estado === 'in' ? ' (in play)' : ''}`);
  //
  //     return {
  //       content: [{ type: 'text', text: `Latest results from LaLiga\n${filas.join('\n')}` }],
  //     };
  //   },
  // );

  // • STEP 3 · A tool with parameters: the tab of a team •
  // inputSchema (zod) tells the model what has to happen. If anything fails, isError:.
  // server.registerTool(
  //   'ver_equipo',
  //   {
  //     title: 'Team details',
  //     description: 'Position in the table, last five results and next match of a LaLiga team.',
  //     inputSchema: z.object({
  //       team: z.string().describe('Team name or nickname, e.g. "Barça", "Atleti" or "real Society"'),
  //     }),
  //     annotations: { readOnlyHint: true },
  //   },
  //   async ({ equipo: texto }) => {
  //     try {
  //       const equipo = await verEquipo(texto);
  //       const { proximo } = equipo;
  //
  //       const lineas = [
  //         `${equipo.nombre}: ${equipo.posicion}º en LaLiga ${equipo.temporada} con ${equipo.puntos} pts ` +
  //           `(${equipo.ganados}G ${equipo.empatados}E ${equipo.perdidos}P).`,
  //         'Latest matches (from the latest to the oldest):',.
  //         ...equipo.ultimos.map((p) => `- ${p.resultado} · ${fecha(p.fecha)}: ${marcador(p)}`),
  //         proximo
  //           ♪ `Próximo partido: ${proximo.local.nombre} - ${proximo.visitante.nombre}, ${fecha(proximo.fecha)} en ${proximo.estadio}.`
  //           : 'No scheduled matches.',.
  //       ];
  //
  //       return { content: [{ type: 'text', text: lineas.join('\n') }] };
  //     } catch (error) {
  //       return { isError: true, content: [{ type: 'text', text: error.message }] };
  //     }
  //   },
  // );

  return server;
}

if (process.argv.includes('--stdio')) {
  // For clients who start the server as a process (Claude Desktop, for example)
  await crearServidor().connect(new StdioServerTransport());
} else {
  // HTTP server in http://localhost:3101/mcp
  const PUERTO = Number(process.env.PORT ?? 3101);
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
