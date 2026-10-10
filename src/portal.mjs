// Session + operations against Portal das Financas "Faturas e Recibos"
// (irs.portaldasfinancas.gov.pt/recibos). Unofficial: endpoints were
// observed from the public web app and may change without notice.

import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYmd, twelveMonthWindows, ymd } from './dates.mjs';

const ORIGIN = 'https://irs.portaldasfinancas.gov.pt';
const BASE = `${ORIGIN}/recibos`;
const TOKEN_TTL_MS = 15 * 60 * 1000;

export function loadCredentials(env = process.env) {
  if (env.FINANCAS_NIF && env.FINANCAS_PASSWORD) return { nif: env.FINANCAS_NIF.trim(), password: env.FINANCAS_PASSWORD };
  const file = env.FINANCAS_CREDENTIALS_FILE || path.join(os.homedir(), '.config', 'financas-pt-mcp', 'credentials');
  if (!fs.existsSync(file)) {
    throw new Error(`No credentials. Set FINANCAS_NIF + FINANCAS_PASSWORD, or put "NIF\\nPASSWORD" in ${file} (chmod 600).`);
  }
  const [nif, password] = fs.readFileSync(file, 'utf8').split('\n').map((s) => s.replace(/\r$/, ''));
  if (!nif || !password) throw new Error(`Credentials file ${file} must have the NIF on line 1 and the password on line 2.`);
  return { nif: nif.trim(), password };
}

/** Compact view of a document row from obtemDocumentosV2. */
export function summarizeDoc(d) {
  return {
    id: d.numDocumento,
    number: d.numeroUnico,
    type: d.tipoDocumento,
    status: d.situacao,
    issueDate: d.dataEmissao,
    transactionDate: d.dataPrestacaoServico,
    atcud: d.codAtcud,
    client: { nif: d.nifAdquirente, name: d.nomeAdquirente, country: d.paisNifEstrangeiro },
    base: d.valorBase,
    vat: d.valorIVA,
    irsWithholding: d.valorIRS,
    stampDuty: d.valorImpostoSelo,
    total: d.valorTotalCImpostos,
    received: d.importanciaRecebida,
    vatLines: (d.taxasIva || []).map((t) => ({ rate: t.taxa, base: t.valorBase, vat: t.valorIva, exemptionCode: t.motivoIsencao })),
    userId: d.userId,
  };
}

/** Human-readable summary of an emitirV2 payload. */
export function summarizePayload(p) {
  return {
    type: p.tipoDocumentoLabel,
    transactionDate: p.dataPrestacao,
    activity: p.atividadePrestadorDescr,
    client: { nif: p.nifAdquirente, name: p.nomeAdquirente, address: [p.moradaAdqClienteL, p.codPostalAdqCliente, p.localidadeAdqCliente].filter(Boolean).join(', ') },
    lines: (p.linhasDocumento || []).map((l) => ({
      kind: l.tipoProduto, reference: l.referencia, description: l.descricao, quantity: l.quantidade,
      unitPrice: l.precoUnit, vatRate: l.taxaIVA, exemptionCode: l.motivoIsencaoLinha, total: l.totalCIVA,
    })),
    vatSummary: (p.taxasIva || []).map((t) => ({ rate: t.taxa, base: t.valorBase, vat: t.valorIva, exemptionCode: t.motivoIsencao })),
    irsRegimeCode: p.regimeIncidenciaIrs,
    base: p.valorBase,
    vat: p.valorIVA,
    irsWithholding: p.valorTotalRetFonte,
    total: p.valorTotalCImpostos,
    received: p.importanciaRecebida,
  };
}

export const payloadHash = (p) => {
  const { isToValidate, ...rest } = p;
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
};

export class Portal {
  constructor({ credentials, headless = true, stateDir } = {}) {
    this.credentials = credentials;
    this.headless = headless;
    this.stateDir = stateDir || path.join(os.homedir(), '.cache', 'financas-pt-mcp');
    this.lockFile = path.join(this.stateDir, 'LOGIN_FAILED.lock');
    this.previews = new Map();
    this.queue = Promise.resolve();
    this.loggedInOnce = false;
    fs.mkdirSync(this.stateDir, { recursive: true });
  }

  /** Serialize all portal operations on the single browser page. */
  run(fn) {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  async browserPage() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.headless });
      this.context = await this.browser.newContext({ locale: 'pt-PT' });
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  async close() {
    await this.browser?.close().catch(() => {});
    this.browser = this.context = this.page = undefined;
  }

  /** One login attempt. A failure writes a lock file so we never burn the 5-attempt limit. */
  async login() {
    if (fs.existsSync(this.lockFile)) {
      throw new Error(`Login disabled: a previous login failed (${fs.readFileSync(this.lockFile, 'utf8').trim()}). Fix the credentials, then delete ${this.lockFile}.`);
    }
    if (!this.credentials) this.credentials = loadCredentials();
    const page = await this.browserPage();
    await page.goto(`${BASE}/portal/consultar`);
    if (page.url().startsWith(BASE)) return this.whoAmI();
    await page.getByRole('tab', { name: 'NIF' }).click();
    await page.getByRole('textbox', { name: 'Número de Contribuinte' }).fill(this.credentials.nif);
    await page.getByRole('textbox', { name: 'Senha de acesso' }).fill(this.credentials.password);
    await page.getByRole('button', { name: 'Autenticar' }).click();
    try {
      await page.waitForURL((u) => u.href.startsWith(BASE), { timeout: 30000 });
    } catch {
      const body = await page.locator('body').innerText().catch(() => '');
      const reason = body.match(/Tem mais \d+ tentativas[^\n]*/)?.[0] || body.match(/[^\n]*(bloquead|inválid)[^\n]*/i)?.[0] || 'login did not complete';
      fs.writeFileSync(this.lockFile, `${new Date().toISOString()} ${reason}\n`, { mode: 0o600 });
      throw new Error(`Login failed: ${reason}. Further logins are disabled until ${this.lockFile} is deleted.`);
    }
    this.loggedInOnce = true;
    return this.whoAmI();
  }

  async whoAmI() {
    const page = this.page;
    const header = await page.locator('body').innerText().catch(() => '');
    const name = header.match(/Bo[ma] (?:dia|tarde|noite),\s*([^\n]+)/i)?.[1]?.trim();
    return { nif: this.credentials.nif, name: name || null };
  }

  async ensureSession() {
    const page = await this.browserPage();
    if (!this.loggedInOnce) return this.login();
    if (!page.url().startsWith(BASE)) await page.goto(`${BASE}/portal/consultar`);
    if (!page.url().startsWith(BASE)) { this.loggedInOnce = false; return this.login(); }
  }

  /** GET a JSON API path in the logged-in browser context; re-login once if the session expired. */
  async apiGet(apiPath, params) {
    await this.ensureSession();
    const url = `${BASE}${apiPath}?${new URLSearchParams(params)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.context.request.get(url, { headers: { accept: 'application/json' } });
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('json')) return res.json();
      if (attempt === 0) { this.loggedInOnce = false; await this.login(); }
    }
    throw new Error(`Unexpected non-JSON response from ${apiPath}`);
  }

  async listDocuments({ from, to, clientNif, status, limit = 200 } = {}) {
    const today = ymd(new Date());
    to = to || today;
    if (!from) { const d = parseYmd(to); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); from = ymd(d); }
    const nif = this.credentials?.nif || loadCredentials().nif;
    const out = [];
    for (const [f, t] of twelveMonthWindows(from, to).reverse()) {
      for (let offset = 0; ; offset += 50) {
        const j = await this.apiGet('/api/obtemDocumentosV2', {
          dataEmissaoInicio: f, dataEmissaoFim: t, isAutoSearchOn: 'on', modoConsulta: 'Prestador',
          nifPrestadorServicos: nif, offset: String(offset), tableSize: '50', tipoPesquisa: '1',
        });
        if (!j.success) throw new Error(`Portal error: ${j.errorMessage} ${JSON.stringify(j.fieldErrors || {})}`);
        const docs = j.listaDocumentos || [];
        out.push(...docs);
        if (docs.length < 50 || out.length >= j.totalDocs) break;
      }
    }
    let rows = out.map(summarizeDoc);
    if (clientNif) rows = rows.filter((r) => r.client.nif === clientNif);
    if (status) rows = rows.filter((r) => r.status?.toLowerCase() === status.toLowerCase());
    rows.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || b.id - a.id);
    return { from, to, count: rows.length, documents: rows.slice(0, limit) };
  }

  async getDocument(id, userId = 0) {
    await this.ensureSession();
    const nif = this.credentials.nif;
    const page = this.page;
    await page.goto(`${BASE}/portal/consultar/detalheV2/${nif}/${userId}/${id}`);
    await page.locator('#main-content').waitFor();
    await page.waitForFunction(() => /Fatura|Recibo|Nota de Crédito/.test(document.querySelector('#main-content')?.innerText || ''), null, { timeout: 15000 });
    const text = (await page.locator('#main-content').innerText())
      .replace(/\n{2,}/g, '\n').split('\n').map((s) => s.trim()).filter((s) => s && s !== '×').join('\n');
    return { id, url: page.url(), text };
  }

  async downloadPdf(number, outputPath, userId = 0) {
    await this.ensureSession();
    const nif = this.credentials.nif;
    const url = `${BASE}/portal/imprimirV2/${nif}/${userId}/${encodeURIComponent(number.replace('/', '-'))}/normal`;
    const res = await this.context.request.get(url);
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('pdf')) throw new Error(`Expected a PDF, got ${res.status()} ${ct}`);
    const file = path.resolve(outputPath || `${number.replace(/[ /]/g, '_')}.pdf`);
    fs.writeFileSync(file, await res.body());
    return { file, bytes: fs.statSync(file).size };
  }

  /**
   * Open the portal's "Emitir novo" (copy) form for a document with a new
   * transaction date, press Emitir and capture the server-side validation
   * call (emitirV2 with isToValidate=true). Nothing is issued.
   */
  async captureCopyValidation(sourceId, transactionDate) {
    const page = this.page;
    await page.goto(`${BASE}/portal/emitir/emitirfaturaV2?idDocumento=${sourceId}&dataCopia=${transactionDate}&validated=true`);
    try {
      await page.waitForFunction((d) => document.querySelector('#main-content input[name=dataPrestacao]')?.value === d
        && document.querySelector('#main-content input[name=nifAdquirente]')?.value, transactionDate, { timeout: 20000 });
    } catch {
      throw new Error(`The portal did not load the copy form for ${transactionDate}. Future transaction dates are rejected, and the source document must be one of yours.`);
    }
    await page.waitForTimeout(1000);
    const reqP = page.waitForRequest((r) => r.url().endsWith('/api/emitirV2') && r.method() === 'POST', { timeout: 20000 });
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/emitirV2') && r.request().method() === 'POST', { timeout: 20000 });
    await page.getByRole('button', { name: 'Emitir', exact: true }).first().click();
    const [req, res] = await Promise.all([reqP, resP]);
    const payload = JSON.parse(req.postData());
    if (payload.isToValidate !== true) throw new Error('Safety stop: the first Emitir call was not a validation call. The portal changed; refusing to continue.');
    const validation = await res.json();
    await page.waitForTimeout(800);
    const modal = page.locator('.modal:visible').first();
    const confirmText = (await modal.count()) ? (await modal.innerText()).replace(/\s+/g, ' ').trim() : null;
    return { payload, validation, confirmText };
  }

  async previewCopy({ sourceId, transactionDate }) {
    parseYmd(transactionDate);
    if (transactionDate > ymd(new Date())) throw new Error('The portal does not accept future transaction dates.');
    await this.ensureSession();
    const { payload, validation, confirmText } = await this.captureCopyValidation(sourceId, transactionDate);
    const summary = summarizePayload(payload);
    const { documents } = await this.listDocuments({ clientNif: payload.nifAdquirente });
    const sameDate = documents.filter((d) => d.transactionDate === transactionDate && d.status === 'Emitido');
    const token = crypto.randomBytes(8).toString('hex');
    if (validation.success) {
      this.previews.set(token, { sourceId, transactionDate, hash: payloadHash(payload), at: Date.now() });
    }
    return {
      validatedByPortal: !!validation.success,
      portalErrors: validation.success ? null : { message: validation.errorMessage, fields: validation.fieldErrors },
      previewToken: validation.success ? token : null,
      expiresInMinutes: validation.success ? TOKEN_TTL_MS / 60000 : null,
      possibleDuplicates: sameDate.map((d) => d.number),
      summary,
      portalConfirmation: confirmText,
    };
  }

  async emitCopy({ previewToken, confirm, allowDuplicate = false }) {
    if (confirm !== true) throw new Error('Refusing to issue: confirm must be true.');
    const prev = this.previews.get(previewToken);
    if (!prev) throw new Error('Unknown or already used previewToken. Run preview_copy first.');
    if (Date.now() - prev.at > TOKEN_TTL_MS) { this.previews.delete(previewToken); throw new Error('previewToken expired. Run preview_copy again.'); }
    await this.ensureSession();
    if (!allowDuplicate) {
      const before = await this.listDocuments({});
      const src = before.documents.find((d) => d.id === prev.sourceId);
      const dup = before.documents.find((d) => d.status === 'Emitido' && d.transactionDate === prev.transactionDate && (!src || d.client.nif === src.client.nif));
      if (dup) throw new Error(`${dup.number} already has transaction date ${prev.transactionDate} for this client. Pass allowDuplicate: true if this is intended.`);
    }
    const { payload, validation } = await this.captureCopyValidation(prev.sourceId, prev.transactionDate);
    if (!validation.success) throw new Error(`Portal validation failed: ${validation.errorMessage}`);
    if (payloadHash(payload) !== prev.hash) throw new Error('Safety stop: the document differs from the preview. Run preview_copy again.');
    const page = this.page;
    const modal = page.locator('.modal:visible').first();
    const text = (await modal.innerText()).replace(/\s+/g, ' ');
    if (!text.includes(`Data da Transação: ${prev.transactionDate}`)) throw new Error('Safety stop: confirmation dialog does not show the expected date.');
    this.previews.delete(previewToken);
    await modal.getByRole('button', { name: /^emitir$/i }).click();
    await page.waitForURL(/detalheV2\/\d+\/\d+\/\d+/, { timeout: 30000 });
    const id = Number(page.url().match(/detalheV2\/\d+\/\d+\/(\d+)/)[1]);
    const doc = await this.getDocument(id);
    return { issued: true, id, number: doc.text.match(/F\w* [A-Z0-9]+\/\d+/)?.[0] || null, url: doc.url, document: doc.text };
  }
}
