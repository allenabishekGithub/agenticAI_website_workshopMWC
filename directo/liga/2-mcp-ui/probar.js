// Check the server without needing a chat client: node probar.js
// (server has to be booted with `npm run dev`)
// Just call the tools that are already registered, so it works after every step.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const URL_SERVIDOR = process.env.MCP_URL ?? 'http://localhost:3102/mcp';
const MAX_LINEAS = 8;

const EJEMPLOS = {
  ver_clasificacion: {},
  ver_resultados: {},
  ver_equipo: { equipo: 'Barça' },
};

const client = new Client({ name: 'probar', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_SERVIDOR)));

const { tools } = client.getServerCapabilities()?.tools ? await client.listTools() : { tools: [] };

if (tools.length === 0) {
  console.log('The server still doesn\'t have tools: unblock server.js Step 1.');
  await client.close();
  process.exit();
}

console.log('Tools:');
for (const tool of tools) {
  const vista = tool._meta?.ui?.resourceUri;
  console.log(`  - ${tool.name}${vista ? `  → interface: ${vista}` : ''}`);
}

for (const { name } of tools) {
  const argumentos = EJEMPLOS[name] ?? {};
  const resultado = await client.callTool({ name, arguments: argumentos });
  const lineas = resultado.content[0].text.split('\n');

  console.log(`\n${name}(${JSON.stringify(argumentos)}):`);
  console.log(lineas.slice(0, MAX_LINEAS).join('\n'));
  if (lineas.length > MAX_LINEAS) console.log(`… (${lineas.length - MAX_LINEAS} more lines)`);
  if (resultado.structuredContent) {
    console.log(`→ structuredContent for the view: { ${Object.keys(resultado.structuredContent).join(', ')} }`);
  }
}

const conVista = tools.find((tool) => tool._meta?.ui?.resourceUri);
if (conVista) {
  const uri = conVista._meta.ui.resourceUri;
  try {
    const { contents } = await client.readResource({ uri });
    const [vista] = contents;
    console.log(`\nVista ${vista.uri}: ${vista.mimeType}, ${(vista.text.length / 1024).toFixed(0)} KB of HTML`);
  } catch {
    console.log(`\nLas tools link ${uri}but the server still doesn't use that resource (registerAppResource).`);
  }
} else {
  console.log('\nNinguna tool has interface: only text is returned.');
}

await client.close();
