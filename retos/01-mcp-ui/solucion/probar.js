// Check the server without needing a chat client: node probar.js
// (server has to be booted with `npm run dev`)
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const URL_SERVIDOR = process.env.MCP_URL ?? 'http://localhost:3001/mcp';

const client = new Client({ name: 'probar', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_SERVIDOR)));

const { tools } = await client.listTools();
console.log('Tools:');
for (const tool of tools) {
  const vista = tool._meta?.ui?.resourceUri;
  console.log(`  - ${tool.name}${vista ? `  → interface: ${vista}` : ''}`);
}

const busqueda = await client.callTool({ name: 'buscar_productos', arguments: { categoria: 'audio' } });
console.log('\nbuscar_productos({ categoria: "audio" }):');
console.log(busqueda.content[0].text);

const conVista = tools.find((tool) => tool._meta?.ui?.resourceUri);
if (conVista) {
  const { contents } = await client.readResource({ uri: conVista._meta.ui.resourceUri });
  const [vista] = contents;
  console.log(`\nVista ${vista.uri}: ${vista.mimeType}, ${(vista.text.length / 1024).toFixed(0)} KB of HTML`);
} else {
  console.log('\n⚠️  No tool has an interface yet (_meta.ui.resourceUri).');
}

await client.close();
