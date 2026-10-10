// Session + operations against Portal das Financas "Faturas e Recibos"
// Comment-only change (temporary gate check)
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

  /** Client and product catalogues (status A = active, I = inactive). */
  async listCatalog(kind, status = 'A') {
    const nif = this.credentials?.nif || loadCredentials().nif;
    const api = kind === 'clients' ? '/api/obtemClientesCatalogo' : '/api/obtemProdutosCatalogo';
    const j = await this.apiGet(api, { nifPrestadorServicos: nif, situacao: status, userIdPrestadorServicos: '0' });
    if (!j.success) throw new Error(`Portal error: ${j.errorMessage}`);
    if (kind === 'clients') {
      return (j.listaClientes || []).map((c) => ({
        id: c.idCliente, nif: c.nifAdquirente ? String(c.nifAdquirente) : c.nifEstrangeiro, name: c.nomeAdquirente,
        address: [c.moradaAdqClienteL, c.codPostalAdqCliente, c.localidadeAdqCliente].filter(Boolean).join(', '),
        country: c.paisAdqClienteLabel?.trim(), email: c.email, status: c.estado, since: c.dataInicio,
      }));
    }
    return (j.listaProdutos || []).map((p) => ({
      id: p.iBemServ, kind: p.tipoProdutoLabel, reference: p.referencia, description: p.descricao,
      unit: p.unidadeLabel, unitPrice: p.precoUnit, status: p.estado, since: p.dataInicio,
    }));
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

  /** Press the form's Emitir button and capture the validation-only emitirV2 call. Nothing is issued. */
  async captureValidation() {
    const page = this.page;
    const reqP = page.waitForRequest((r) => r.url().endsWith('/api/emitirV2') && r.method() === 'POST', { timeout: 20000 });
    const resP = page.waitForResponse((r) => r.url().endsWith('/api/emitirV2') && r.request().method() === 'POST', { timeout: 20000 });
    await page.locator('#main-content').getByRole('button', { name: 'Emitir', exact: true }).first().click();
    const [req, res] = await Promise.all([reqP, resP]);
    const payload = JSON.parse(req.postData());
    if (payload.isToValidate !== true) throw new Error('Safety stop: the first Emitir call was not a validation call. The portal changed; refusing to continue.');
    const validation = await res.json();
    await page.waitForTimeout(800);
    const modal = page.locator('.modal:visible').first();
    const confirmText = (await modal.count()) ? (await modal.innerText()).replace(/\s+/g, ' ').trim() : null;
    return { payload, validation, confirmText };
  }

  /** Open the portal's "Emitir novo" (copy) form with a new transaction date. */
  async fillCopyForm({ sourceId, transactionDate }) {
    const page = this.page;
    await page.goto(`${BASE}/portal/emitir/emitirfaturaV2?idDocumento=${sourceId}&dataCopia=${transactionDate}&validated=true`);
    try {
      await page.waitForFunction((d) => document.querySelector('#main-content input[name=dataPrestacao]')?.value === d
        && document.querySelector('#main-content input[name=nifAdquirente]')?.value, transactionDate, { timeout: 20000 });
    } catch {
      throw new Error(`The portal did not load the copy form for ${transactionDate}. Future transaction dates are rejected, and the source document must be one of yours.`);
    }
    await page.waitForTimeout(1000);
  }

  /** Fill the blank Fatura-Recibo form from a validated spec (see normalizeNewSpec). */
  async fillNewForm(spec) {
    const page = this.page;
    const mc = page.locator('#main-content');
    await page.goto(`${BASE}/portal/emitir/emitirfaturaV2`);
    await mc.locator('input[name=dataPrestacao]').first().fill(spec.transactionDate);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    await mc.locator('select[name=tipoRecibo]').selectOption({ label: 'Fatura-Recibo' });
    await mc.locator('select[name=regimeIncidenciaIrs]').waitFor({ state: 'attached', timeout: 20000 })
      .catch(() => { throw new Error(`The portal did not open the form for ${spec.transactionDate}. Future transaction dates are rejected.`); });
    await page.waitForTimeout(1000);

    if (spec.activity) {
      const act = mc.locator('select[name=atividadePrestador]');
      const opts = await act.locator('option').allTextContents();
      const label = opts.find((o) => o.trim().toUpperCase() === spec.activity.toUpperCase());
      if (!label) throw new Error(`Activity '${spec.activity}' not found. Options: ${opts.map((o) => o.trim()).filter(Boolean).join('; ')}`);
      await act.selectOption({ label });
    }

    const nifIn = mc.locator('input[name=nifAdquirente][maxlength="9"]');
    await nifIn.fill(spec.clientNif);
    await nifIn.blur();
    try {
      await page.waitForFunction(() => document.querySelector('#main-content input[name=nomeAdquirente]')?.value, null, { timeout: 15000 });
    } catch {
      throw new Error(`The portal could not identify client NIF ${spec.clientNif}.`);
    }
    await mc.locator('input[name=titulo][value="1"]').check();

    for (const line of spec.lines) {
      await mc.getByRole('button', { name: 'Adicionar' }).click();
      const m = page.locator('.modal:visible').first();
      await m.locator('select[name=tipoProduto]').waitFor();
      await m.locator('select[name=tipoProduto]').selectOption(`string:${line.kind}`);
      await m.locator('select[name=tipoRef]').selectOption('string:OUT');
      await m.locator('input[name=referencia]').fill(line.reference);
      await m.locator('textarea[name=descricao]').fill(line.description);
      await typeMasked(m.locator('input[name=quantidade]'), line.quantity, 3);
      await m.locator('select[name=unidade]').selectOption(`string:${UNITS[line.unit]}`);
      await typeMasked(m.locator('input[name=precoUnit]'), line.unitPrice, 2);
      await m.locator('select[name=idTaxaIVA]').selectOption(VAT_RATES[line.vatRate]);
      await page.waitForTimeout(400);
      if (line.vatRate === 0) {
        const codes = await m.locator('select[name=motivoIsencaoLinha] option').evaluateAll((os) => os.map((o) => o.value));
        if (!codes.includes(`string:${line.exemptionCode}`)) {
          const list = await m.locator('select[name=motivoIsencaoLinha] option').evaluateAll((os) => os.filter((o) => o.value).map((o) => `${o.value.replace('string:', '')} = ${o.text}`));
          throw new Error(`Exemption code ${line.exemptionCode} is not valid for this date. Valid codes: ${list.join('; ')}`);
        }
        await m.locator('select[name=motivoIsencaoLinha]').selectOption(`string:${line.exemptionCode}`);
      }
      await m.getByRole('button', { name: 'Guardar' }).click();
      await page.waitForTimeout(1000);
      if (await page.locator('.modal:visible').count()) {
        const err = await page.locator('.modal:visible').first().innerText();
        throw new Error(`The portal rejected line '${line.description}': ${err.replace(/\s+/g, ' ').slice(0, 300)}`);
      }
    }

    const irs = mc.locator('select[name=regimeIncidenciaIrs]');
    const irsOpts = await irs.locator('option').allTextContents();
    const irsLabel = irsOpts.find((o) => o.trim().startsWith(IRS_REGIMES[spec.irsRegime]));
    if (!irsLabel) throw new Error(`IRS regime '${spec.irsRegime}' not offered by the portal.`);
    await irs.selectOption({ label: irsLabel });
    await page.waitForTimeout(600);
    if (spec.irsRate != null) {
      const rate = mc.locator('select[name=regimeRetencaoIrs]');
      const opts = await rate.locator('option').allTextContents();
      const rx = new RegExp(`taxa de ${String(spec.irsRate).replace('.', '[.,]')}\\s?%`, 'i');
      const label = opts.find((o) => rx.test(o) && !/Açores|Madeira/i.test(o));
      if (!label) throw new Error(`IRS withholding rate ${spec.irsRate}% not offered. Options: ${opts.map((o) => o.trim()).filter(Boolean).join('; ')}`);
      await rate.selectOption({ label });
      await page.waitForTimeout(600);
    }
    if (spec.notes) {
      await page.locator('#buttonObservacoes').click();
      await mc.locator('textarea[name=observacoes]').fill(spec.notes);
    }
  }

  async preview(kind, spec) {
    parseYmd(spec.transactionDate);
    if (spec.transactionDate > ymd(new Date())) throw new Error('The portal does not accept future transaction dates.');
    await this.ensureSession();
    if (kind === 'copy') await this.fillCopyForm(spec); else await this.fillNewForm(spec);
    const { payload, validation, confirmText } = await this.captureValidation();
    const summary = summarizePayload(payload);
    const clientNif = String(payload.nifAdquirente);
    const { documents } = await this.listDocuments({ clientNif });
    const sameDate = documents.filter((d) => d.transactionDate === spec.transactionDate && d.status === 'Emitido');
    const token = crypto.randomBytes(8).toString('hex');
    if (validation.success) {
      this.previews.set(token, { kind, spec, clientNif, hash: payloadHash(payload), at: Date.now() });
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

  previewCopy({ sourceId, transactionDate }) {
    return this.preview('copy', { sourceId, transactionDate });
  }

  previewNew(input) {
    return this.preview('new', normalizeNewSpec(input));
  }

  async emit({ previewToken, confirm, allowDuplicate = false }) {
    if (confirm !== true) throw new Error('Refusing to issue: confirm must be true.');
    const prev = this.previews.get(previewToken);
    if (!prev) throw new Error('Unknown or already used previewToken. Run preview_copy or preview_new first.');
    if (Date.now() - prev.at > TOKEN_TTL_MS) { this.previews.delete(previewToken); throw new Error('previewToken expired. Preview again.'); }
    await this.ensureSession();
    if (!allowDuplicate) {
      const { documents } = await this.listDocuments({ clientNif: prev.clientNif });
      const dup = documents.find((d) => d.status === 'Emitido' && d.transactionDate === prev.spec.transactionDate);
      if (dup) throw new Error(`${dup.number} already has transaction date ${prev.spec.transactionDate} for this client. Pass allowDuplicate: true if this is intended.`);
    }
    if (prev.kind === 'copy') await this.fillCopyForm(prev.spec); else await this.fillNewForm(prev.spec);
    const { payload, validation } = await this.captureValidation();
    if (!validation.success) throw new Error(`Portal validation failed: ${validation.errorMessage}`);
    if (payloadHash(payload) !== prev.hash) throw new Error('Safety stop: the document differs from the preview. Preview again.');
    const page = this.page;
    const modal = page.locator('.modal:visible').first();
    const text = (await modal.innerText()).replace(/\s+/g, ' ');
    if (!text.includes(`Data da Transação: ${prev.spec.transactionDate}`)) throw new Error('Safety stop: confirmation dialog does not show the expected date.');
    this.previews.delete(previewToken);
    await modal.getByRole('button', { name: /^emitir$/i }).click();
    await page.waitForURL(/detalheV2\/\d+\/\d+\/\d+/, { timeout: 30000 });
    const id = Number(page.url().match(/detalheV2\/\d+\/\d+\/(\d+)/)[1]);
    const doc = await this.getDocument(id);
    return { issued: true, id, number: doc.text.match(/F\w* [A-Z0-9]+\/\d+/)?.[0] || null, url: doc.url, document: doc.text };
  }
}

export const UNITS = { 'N/A': '42 ', UN: '1  ', MES: '20 ', H: '18 ', D: '19 ', KG: '2  ', T: '43 ', ANO: '21 ', M: '6  ', KM: '3  ', L: '32 ', KWH: '44 ' };
// Mainland Portugal rates (portal option values).
export const VAT_RATES = { 23: 'number:1', 13: 'number:2', 6: 'number:3', 0: 'object:null' };
export const IRS_REGIMES = {
  none: 'Sem retenção - Art.101º, n.º1 do CIRS',
  exempt_101B_ab: 'Dispensa de retenção - art. 101.º-B, n.º1, al. a) e b)',
  exempt_101B_c: 'Dispensa de retenção - art. 101.º-B, n.º1, al. c)',
  exempt_101B_d: 'Dispensa de retenção - art. 101.º-B, n.º1, al. d)',
  non_resident: 'Sem retenção - Não residente sem estabelecimento',
  on_100: 'Sobre 100% - art. 101.º, n.ºs 1 e 9',
  on_25: 'Sobre 25% - art. 101.º -D, n.º 3',
  on_50_101D: 'Sobre 50% - art. 101.º -D, n.º 1',
  on_50_12A: 'Sobre 50% - art. 12.º-A',
};

const decimalsOk = (n, d) => Math.abs(n * 10 ** d - Math.round(n * 10 ** d)) < 1e-6;

/** Validate and normalize preview_new input before touching the portal. */
export function normalizeNewSpec(i) {
  const errs = [];
  if (!/^\d{9}$/.test(String(i.clientNif || ''))) errs.push('clientNif must be a 9-digit Portuguese NIF');
  if (!Array.isArray(i.lines) || !i.lines.length) errs.push('at least one line is required');
  if (!IRS_REGIMES[i.irsRegime || 'none']) errs.push(`irsRegime must be one of: ${Object.keys(IRS_REGIMES).join(', ')}`);
  const withholds = /^on_/.test(i.irsRegime || 'none');
  if (withholds && i.irsRate == null) errs.push('irsRate is required when irsRegime withholds tax (on_*)');
  if (!withholds && i.irsRate != null) errs.push('irsRate only applies to irsRegime on_*');
  const lines = (i.lines || []).map((l, n) => {
    const p = `line ${n + 1}: `;
    const kind = { service: 'S', product: 'P', other: 'O' }[l.kind || 'service'];
    if (!kind) errs.push(`${p}kind must be service, product or other`);
    if (!l.description?.trim()) errs.push(`${p}description is required`);
    if (!(l.quantity > 0) || !decimalsOk(l.quantity, 3)) errs.push(`${p}quantity must be > 0 with at most 3 decimals`);
    if (!(l.unitPrice > 0) || !decimalsOk(l.unitPrice, 2)) errs.push(`${p}unitPrice must be > 0 with at most 2 decimals`);
    const unit = (l.unit || 'N/A').toUpperCase();
    if (!UNITS[unit]) errs.push(`${p}unit must be one of ${Object.keys(UNITS).join(', ')}`);
    if (!(l.vatRate in VAT_RATES)) errs.push(`${p}vatRate must be 23, 13, 6 or 0`);
    if (l.vatRate === 0 && !l.exemptionCode) errs.push(`${p}exemptionCode is required when vatRate is 0 (e.g. "133" for article 53 CIVA)`);
    if (l.vatRate !== 0 && l.exemptionCode) errs.push(`${p}exemptionCode only applies when vatRate is 0`);
    return {
      kind, unit, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate,
      exemptionCode: l.exemptionCode ? String(l.exemptionCode) : undefined,
      description: (l.description || '').trim(), reference: (l.reference || l.description || '').trim().slice(0, 60),
    };
  });
  if (errs.length) throw new Error(`Invalid input:\n- ${errs.join('\n- ')}`);
  return {
    transactionDate: i.transactionDate, clientNif: String(i.clientNif), lines,
    irsRegime: i.irsRegime || 'none', irsRate: i.irsRate ?? null, notes: i.notes?.trim() || null, activity: i.activity || null,
  };
}

/** Masked numeric inputs need real keystrokes: 200 with 2 decimals is typed as "20000". */
async function typeMasked(locator, value, decimals) {
  await locator.click();
  await locator.press('Control+a');
  await locator.press('Backspace');
  await locator.pressSequentially(String(Math.round(value * 10 ** decimals)), { delay: 20 });
  await locator.blur();
}
