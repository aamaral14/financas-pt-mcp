#!/usr/bin/env node
// MCP server (stdio) for Portal das Financas "Faturas e Recibos" (recibos verdes).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Portal } from './portal.mjs';
import { lastBusinessDayPT } from './dates.mjs';

const portal = new Portal({ headless: process.env.FINANCAS_HEADLESS !== '0' });
const server = new McpServer({ name: 'financas-pt-mcp', version: '0.1.0' });

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const wrap = (fn) => async (args) => {
  try { return ok(await portal.run(() => fn(args))); }
  catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');

server.registerTool('login', {
  title: 'Log in to Portal das Finanças',
  description: 'Log in with the configured NIF and password (one attempt). A failed login disables further attempts until a lock file is removed, to avoid the portal lockout after 5 failures. Other tools log in automatically.',
  annotations: { readOnlyHint: true, openWorldHint: true },
}, wrap(() => portal.login()));

server.registerTool('list_documents', {
  title: 'List issued invoices/receipts',
  description: 'List Faturas, Faturas-Recibo and Recibos you issued (recibos verdes), newest first. Splits ranges longer than 12 months automatically. Defaults to the last 12 months.',
  inputSchema: {
    from: date.optional().describe('Issue date from (YYYY-MM-DD)'),
    to: date.optional().describe('Issue date to (YYYY-MM-DD), default today'),
    clientNif: z.string().optional().describe('Only documents for this client NIF'),
    status: z.string().optional().describe('e.g. "Emitido" or "Anulado"'),
    limit: z.number().int().min(1).max(1000).optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, wrap((a) => portal.listDocuments(a)));

server.registerTool('get_document', {
  title: 'Get document detail',
  description: 'Full detail of one document (issuer, client, lines, VAT, IRS, totals) by its internal id (the "id" from list_documents).',
  inputSchema: { id: z.number().int(), userId: z.number().int().optional() },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, wrap(({ id, userId }) => portal.getDocument(id, userId)));

server.registerTool('download_pdf', {
  title: 'Download document PDF',
  description: 'Save the official PDF of a document, by its number (e.g. "FR ATSIRE01FR/12").',
  inputSchema: {
    number: z.string().describe('Document number, e.g. "FR ATSIRE01FR/12"'),
    outputPath: z.string().optional().describe('Where to save; default ./<number>.pdf'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
}, wrap(({ number, outputPath }) => portal.downloadPdf(number, outputPath)));

server.registerTool('preview_copy', {
  title: 'Preview a copy of a document with a new date',
  description: 'Prepare a new document identical to an existing one (same client, lines, VAT and IRS), changing only the transaction date. The Finanças server validates it, but NOTHING is issued. Returns a summary, possible duplicates and a previewToken for emit_copy. Show the summary to the user before issuing.',
  inputSchema: {
    sourceId: z.number().int().describe('Internal id of the document to copy (from list_documents)'),
    transactionDate: date.describe('Transaction (service) date for the new document; cannot be in the future'),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, wrap((a) => portal.previewCopy(a)));

server.registerTool('emit_copy', {
  title: 'ISSUE the previewed document',
  description: 'Issue the document prepared by preview_copy. This creates a REAL tax document at the Autoridade Tributária. Only call it after the user explicitly approved the preview. Re-checks that the document matches the preview and refuses duplicates for the same client and date unless allowDuplicate is true.',
  inputSchema: {
    previewToken: z.string(),
    confirm: z.literal(true).describe('Must be true: the user approved issuing this document'),
    allowDuplicate: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
}, wrap((a) => portal.emitCopy(a)));

server.registerTool('last_business_day', {
  title: 'Last business day of a month (Portugal)',
  description: 'Last weekday of the month that is not a Portuguese national holiday.',
  inputSchema: { year: z.number().int(), month: z.number().int().min(1).max(12) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ year, month }) => ok({ date: lastBusinessDayPT(year, month) }));

const shutdown = async () => { await portal.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown);

await server.connect(new StdioServerTransport());
