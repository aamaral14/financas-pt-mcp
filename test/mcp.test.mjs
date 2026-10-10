// MCP protocol test: starts the real server over stdio, no portal access, no credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXPECTED = ['login', 'list_documents', 'list_clients', 'list_products', 'get_document', 'download_pdf',
  'preview_copy', 'preview_new', 'emit_document', 'last_business_day'];

async function connect() {
  const client = new Client({ name: 'mcp-test', version: '0' });
  const env = { ...process.env, FINANCAS_CREDENTIALS_FILE: path.join(os.tmpdir(), 'financas-no-such-file'), HOME: os.tmpdir() };
  delete env.FINANCAS_NIF; delete env.FINANCAS_PASSWORD;
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/index.mjs'], env }));
  return client;
}

test('exposes the expected tools with safety annotations', async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [...EXPECTED].sort());
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    assert.equal(byName.emit_document.annotations.destructiveHint, true);
    for (const n of ['list_documents', 'get_document', 'preview_copy', 'preview_new', 'list_clients', 'list_products']) {
      assert.equal(byName[n].annotations.readOnlyHint, true, `${n} must be read-only`);
    }
    assert.ok(byName.emit_document.inputSchema.required.includes('confirm'));
  } finally { await client.close(); }
});

test('last_business_day works offline', async () => {
  const client = await connect();
  try {
    const r = await client.callTool({ name: 'last_business_day', arguments: { year: 2029, month: 3 } });
    assert.deepEqual(JSON.parse(r.content[0].text), { date: '2029-03-29' });
  } finally { await client.close(); }
});

test('emit_document refuses without confirm or with an unknown token, before any network call', async () => {
  const client = await connect();
  try {
    const noConfirm = await client.callTool({ name: 'emit_document', arguments: { previewToken: 'x', confirm: false } });
    assert.equal(noConfirm.isError, true);
    const badToken = await client.callTool({ name: 'emit_document', arguments: { previewToken: 'x', confirm: true } });
    assert.equal(badToken.isError, true);
    assert.match(badToken.content[0].text, /Unknown or already used previewToken/);
  } finally { await client.close(); }
});

test('preview_new rejects invalid input before touching the portal', async () => {
  const client = await connect();
  try {
    const r = await client.callTool({ name: 'preview_new', arguments: {
      transactionDate: '2026-01-30', clientNif: '123456789',
      lines: [{ description: 'x', quantity: 1, unitPrice: 10, vatRate: 0 }] } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /exemptionCode is required/);
  } finally { await client.close(); }
});

test('portal tools fail clearly without credentials', async () => {
  const client = await connect();
  try {
    const r = await client.callTool({ name: 'login', arguments: {} });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /No credentials/);
  } finally { await client.close(); }
});
