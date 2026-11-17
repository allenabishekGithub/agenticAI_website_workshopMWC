// View Code: runs within the field shown by the MCP client.
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';

const $contenido = document.querySelector('#contenido');
const $temporada = document.querySelector('#temporada');
const $pestañas = document.querySelectorAll('[data-herramienta]');

const app = new App({ name: 'LaLiga', version: '1.0.0' });

/* ~   HTML sure: texts coming from the API always escape ~    */

class Html {
  constructor(texto) {
    this.texto = texto;
  }
}

const escapar = (valor) => String(valor).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const convertir = (valor) =>
  valor == null || valor === false
    ? ''
    : valor instanceof Html
      ? valor.texto
      : Array.isArray(valor)
        ? valor.map(convertir).join('')
        : escapar(valor);

const html = (partes, ...valores) =>
  new Html(partes.reduce((resultado, parte, i) => resultado + parte + convertir(valores[i]), ''));

const mostrar = (contenido) => {
  $contenido.innerHTML = contenido.texto;
};

/* ───────────── Formato ───────────── */

const zonaHoraria = 'Europe/Madrid';
const dia = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zonaHoraria });
const hora = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zonaHoraria });

const diferencia = ({ golesAFavor, golesEnContra }) => {
  const dg = golesAFavor - golesEnContra;
  return dg > 0 ? `+${dg}` : String(dg);
};

const RESULTADOS = { G: 'Win', E: 'Draw', P: 'Loss' };

/* ───────────── Piezas ───────────── */

const escudo = (url, tamaño = 20) =>
  url
    ? html`<img class="escudo" src="${url}" alt="" width="${tamaño}" height="${tamaño}" loading="lazy" />`
    : html`<span class="escudo" style="width:${tamaño}px;height:${tamaño}px"></span>`;

const botonEquipo = (equipo) =>
  html`<button type="button" class="equipo" data-equipo="${equipo.nombre}"soil="See the tab of ${equipo.nombre}">
    ${escudo(equipo.escudo)}<span class="nombre">${equipo.nombre}</span>
  </button>`;

function filaPartido(partido) {
  const { local, visitante, estado } = partido;
  const jugado = estado !== 'pre';
  const clase = (a, b) => (jugado && a.goles > b.goles ? 'gana' : jugado && a.goles < b.goles ? 'pierde' : '');

  return html`
    <li class="partido" data-estado="${estado}">
      <span class="lado local ${clase(local, visitante)}">${botonEquipo(local)}</span>
      <span class="marcador">
        ${jugado ? html`${local.goles}<span aria-hidden="true">-</span>${visitante.goles}` : hora(partido.fecha)}
      </span>
      <span class="lado visitante ${clase(visitante, local)}">${botonEquipo(visitante)}</span>
      ${estado === 'in' ? html`<span class="en-juego">At stake</span>` : ''}
    </li>`;
}

/* ───────────── Vistas ───────────── */

function pintarClasificacion({ temporada, equipos }) {
  $temporada.textContent = `LaLiga · ${temporada}`;
  const zonas = [...new Set(equipos.map((equipo) => equipo.zona).filter(Boolean))];

  mostrar(html`
    <table class="tabla">
      <thead>
        <tr>
          <th scope="col" class="num">#</th>
          <th scope="col">Team</th>
          <th scope="col" class="num" title="Matches played">PJ</th>
          <th scope="col" class="num opcional" title="Wins">G</th>
          <th scope="col" class="num opcional" title="Draws">E</th>
          <th scope="col" class="num opcional" title="Losses">P</th>
          <th scope="col" class="num" title="Goal difference">DG</th>
          <th scope="col" class="num">Pts</th>
        </tr>
      </thead>
      <tbody>
        ${equipos.map(
          (equipo) => html`
            <tr data-zona="${equipo.zona ?? ''}">
              <td class="num posicion">${equipo.posicion}</td>
              <td>${botonEquipo(equipo)}</td>
              <td class="num">${equipo.jugados}</td>
              <td class="num opcional">${equipo.ganados}</td>
              <td class="num opcional">${equipo.empatados}</td>
              <td class="num opcional">${equipo.perdidos}</td>
              <td class="num">${diferencia(equipo)}</td>
              <td class="num puntos">${equipo.puntos}</td>
            </tr>`,
        )}
      </tbody>
    </table>
    <ul class="leyenda">
      ${zonas.map((zona) => html`<li data-zona="${zona}">${zona}</li>`)}
    </ul>`);
}

function pintarResultados({ temporada, partidos }) {
  $temporada.textContent = `LaLiga · ${temporada}`;
  const porDia = Map.groupBy(partidos, (partido) => dia(partido.fecha));

  mostrar(html`
    <h1>Last day</h1>
    ${[...porDia].map(
      ([nombreDia, partidosDelDia]) => html`
        <section class="dia">
          <h2>${nombreDia}</h2>
          <ul class="partidos">${partidosDelDia.map(filaPartido)}</ul>
        </section>`,
    )}`);
}

function pintarEquipo(equipo) {
  const { proximo } = equipo;
  const rival = proximo && (proximo.local.id === equipo.id ? proximo.visitante : proximo.local);
  $temporada.textContent = `LaLiga · ${equipo.temporada}`;

  mostrar(html`
    <section class="ficha">
      <div class="cabecera">
        ${escudo(equipo.escudo, 56)}
        <div>
          <h1>${equipo.nombre}</h1>
          <p class="resumen">
            <strong>${equipo.posicion}º</strong> · ${equipo.puntos} pts · ${equipo.ganados}G ${equipo.empatados}E
            ${equipo.perdidos}P · ${equipo.golesAFavor} GF · ${equipo.golesEnContra} GC
          </p>
        </div>
        <ol class="racha" aria-label="Latest results, from the latest to the oldest">
          ${equipo.ultimos.map(
            (partido) =>
              html`<li data-resultado="${partido.resultado}" title="${RESULTADOS[partido.resultado]}">${partido.resultado}</li>`,
          )}
        </ol>
      </div>

      ${proximo
        ? html`
            <h2>Next match</h2>
            <div class="proximo">
              <ul class="partidos">${filaPartido(proximo)}</ul>
              <p class="detalle">${dia(proximo.fecha)} · ${proximo.estadio}</p>
              <button
                type="button"
                class="preguntar"
                data-preguntar="${equipo.nombre} - ${rival.nombre}: how do the two teams get to the game and who do you think will win?" > Ask the assistant </ 030> </div>`
        : ''}

      <h2>Latest matches</h2>
      <ul class="partidos">${equipo.ultimos.map(filaPartido)}</ul>
    </section>`);
}

function pintarEstado(texto, error = false) {
  mostrar(html`<p class="estado ${error ? 'error' : ''}">${texto}</p>`);
}

/** Paint whatever has returned any of the three tools */
function pintar(datos = {}) {
  const activa = datos.clasificacion ? 'ver_clasificacion' : datos.resultados ? 'ver_resultados' : null;
  for (const $pestaña of $pestañas) {
    $pestaña.toggleAttribute('aria-current', $pestaña.dataset.herramienta === activa);
  }

  if (datos.clasificacion) pintarClasificacion(datos.clasificacion);
  else if (datos.resultados) pintarResultados(datos.resultados);
  else if (datos.equipo) pintarEquipo(datos.equipo);
}

/* ~ ~ ~ ~ Communication with the client MCP ~ ~ ~ ~ ~ */
// Live: steps 4 to 8 (steps 1 to 3 are in server.js). Uncheck each block in order
// (select the pass lines and press Cmd + /).

// ─ • STEP 4 · The customer passes us the arguments and then the result ‐ •
// toolinput arrives as soon as the model calls the tool; toolresult arrives when it finishes.
// app.addEventListener('toolinput', ({ arguments: argumentos }) => {
//   if (argumentos?.equipo) pintarEstado(`Buscando «${argumentos.equipo}»…`);
// });
//
// app.addEventListener('toolresult', (resultado) => {
//   if (resultado.isError) pintarEstado(resultado.content?.[0]?.text ?? 'Something went wrong.', true);
//   else pintar(resultado.structuredContent);
// });

// • • STEP 5 · The view calls the server tools, without going through the model •
// The tabs and clicks on a computer use callServerTool.
// async function llamar(name, argumentos = {}) {
//   $contenido.setAttribute('aria-busy', 'true');
//   try {
//     const resultado = await app.callServerTool({ name, arguments: argumentos });
//     if (resultado.isError) throw new Error(resultado.content?.[0]?.text);
//     pintar(resultado.structuredContent);
//   } catch (error) {
//     pintarEstado(error.message || 'Could not load.', true);
//   } finally {
//     $contenido.removeAttribute('aria-busy');
//   }
// }
//
// document.addEventListener('click', (evento) => {
//   const $pestaña = evento.target.closest('[data-herramienta]');
//   if ($pestaña) llamar($pestaña.dataset.herramienta);
//
//   const $equipo = evento.target.closest('[data-equipo]');
//   if ($equipo) llamar('ver_equipo', { equipo: $equipo.dataset.equipo });
// });

// • • STEP 6 · If the user opens a computer in the view, we tell the model • •
// document.addEventListener('click', (evento) => {
//   const $equipo = evento.target.closest('[data-equipo]');
//   if (!$equipo) return;
//
//   app.updateModelContext({
//     content: [{ type: 'text', text: `The user has opened the tab of this computer in the interface: ${$equipo.dataset.equipo}.` }],
//   });
// });

// ~ ~ STEP 7 · The view writes in the chat on behalf of the user ~    
// The "Ask the Wizard" button on a team tab.
// document.addEventListener('click', (evento) => {
//   const $preguntar = evento.target.closest('[data-preguntar]');
//   if (!$preguntar) return;
//
//   app.sendMessage({ role: 'user', content: [{ type: 'text', text: $preguntar.dataset.preguntar }] });
// });

// We connect with the customer (always after registering events)
await app.connect();

// ~ ~ STEP 8 · Let the view not appear in onetone: the subject, colors and fonts of the client ~
// function aplicarContexto(contexto) {
//   if (contexto?.theme) applyDocumentTheme(contexto.theme);
//   if (contexto?.styles?.variables) applyHostStyleVariables(contexto.styles.variables);
//   if (contexto?.styles?.css?.fonts) applyHostFonts(contexto.styles.css.fonts);
// }
//
// aplicarContexto(app.getHostContext());
// app.addEventListener('hostcontextchanged', aplicarContexto);
