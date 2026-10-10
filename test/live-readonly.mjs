// Live, read-only check against the real portal through the MCP protocol.
// Never issues: emit_document is only called with a fake token. Usage: FINANCAS_CREDENTIALS_FILE=... node test/live-readonly.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import os from 'node:os';
import path from 'node:path';

const client = new Client({ name: 'live-readonly', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/index.mjs'], env: process.env }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const tools = (await client.listTools()).tools.map((t) => t.name);
console.log('tools:', tools.join(', '));
const me = await call('login');
console.log('login ok, name present:', !!me.name);
const clients = await call('list_clients');
const products = await call('list_products');
console.log('catalog: clients', clients.length, 'products', products.length, products.map((p) => p.since));
const list = await call('list_documents', { limit: 5 });
console.log('documents (last 12 months):', list.count, list.documents.map((d) => `${d.number} ${d.transactionDate} ${d.status}`));
const last = list.documents.find((d) => d.status === 'Emitido');
if (last) {
  const doc = await call('get_document', { id: last.id });
  console.log('get_document lines:', doc.text.split('\n').length);
  const pdf = await call('download_pdf', { number: last.number, outputPath: path.join(os.tmpdir(), 'financas-test.pdf') });
  console.log('pdf bytes:', pdf.bytes);
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yd = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  const prev = await call('preview_copy', { sourceId: last.id, transactionDate: yd });
  console.log('preview validated:', prev.validatedByPortal, 'token:', !!prev.previewToken, 'total:', prev.summary.total, 'dups:', prev.possibleDuplicates);
  const bad = await client.callTool({ name: 'emit_document', arguments: { previewToken: 'nope', confirm: true } });
  console.log('emit_document with bad token rejected:', bad.isError === true);
  if (process.env.TEST_CLIENT_NIF) {
    const spec = { transactionDate: yd, clientNif: process.env.TEST_CLIENT_NIF, lines: [{ description: 'Test service', quantity: 1.5, unit: 'H', unitPrice: 40, vatRate: 0, exemptionCode: '133' }] };
    const n1 = await call('preview_new', spec);
    console.log('preview_new validated:', n1.validatedByPortal, 'lines:', JSON.stringify(n1.summary.lines), 'total:', n1.summary.total, 'errors:', JSON.stringify(n1.portalErrors));
    const badCode = await client.callTool({ name: 'preview_new', arguments: { ...spec, lines: [{ ...spec.lines[0], exemptionCode: '999' }] } });
    console.log('invalid exemption code rejected:', badCode.isError === true, badCode.content[0].text.slice(0, 80));
  }
}
const clientsAfter = await call('list_clients'); const productsAfter = await call('list_products');
console.log('catalog unchanged:', clientsAfter.length === clients.length && productsAfter.length === products.length);
console.log('last_business_day:', (await call('last_business_day', { year: 2026, month: 10 })).date);
await client.close();
