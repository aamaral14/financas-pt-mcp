<p align="center">
  <img src="assets/logo.svg" width="120" alt="financas-pt-mcp logo">
</p>

<h1 align="center">financas-pt-mcp</h1>

<p align="center">
  <a href="README.pt.md">Português</a> | English
  <br><br>
  <a href="https://github.com/aamaral14/financas-pt-mcp/actions/workflows/ci.yml"><img src="https://github.com/aamaral14/financas-pt-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+">
</p>

Unofficial [MCP](https://modelcontextprotocol.io) server for the Portuguese tax portal (Portal das Finanças), section "Faturas e Recibos" (recibos verdes). It lets an AI assistant such as Claude read your invoices and issue new ones safely.

> **Unofficial.** This project is not affiliated with the Autoridade Tributária e Aduaneira (AT). The AT has no public API for this. The server drives the same web app you use in the browser, so it can break when the portal changes. Every document it issues is a real tax document. Use it at your own risk.

## What it does today

**Read your account**
- List the invoices and receipts you issued, with filters (dates, client, status). Ranges over 12 months are split automatically.
- Show the full detail of a document and download its official PDF.
- List the clients and the products/services saved in your catalogue.

**Issue a Fatura-Recibo, in two safe steps**
- From a copy: the same client, lines, VAT and IRS as an existing document, with a new transaction date. Ideal for monthly receipts.
- From scratch: you give the client NIF and the lines. The portal fills in the client name and address and calculates the totals.
- First a preview, which the Finanças server validates **without issuing**. Then, only with your explicit confirmation, the real issue.

**Helpers**
- Last business day of a month in Portugal (weekends and national holidays excluded).

**Not done yet:** Faturas (only Faturas-Recibo), cancelling, credit notes, foreign clients, documents you received, login with Cartão de Cidadão or Chave Móvel Digital.

## Tools

| Tool | What it does | Changes data? |
|---|---|---|
| `login` | Logs in with your NIF and password. One attempt only (see Safety). | No |
| `list_documents` | Documents you issued, newest first. Filters: `from`, `to`, `clientNif`, `status`. | No |
| `get_document` | Full detail of one document: client, lines, VAT, IRS, totals. | No |
| `download_pdf` | Saves the official PDF of a document. | Local file only |
| `list_clients` | Clients in your catalogue. | No |
| `list_products` | Products and services in your catalogue. | No |
| `preview_copy` | Prepares a copy of a document with a new transaction date. Validated by the AT, **nothing is issued**. Returns a `previewToken`. | No |
| `preview_new` | Prepares a new Fatura-Recibo from scratch. Validated by the AT, **nothing is issued**. Returns a `previewToken`. | No |
| `emit_document` | **Issues** a previewed document. Needs `previewToken` and `confirm: true`. | **Yes, issues a real document** |
| `last_business_day` | Last business day of a month in Portugal. | No |

### Example: monthly receipt

> "Issue this month's receipt for client X, the same as last month, dated the last business day."

1. `list_documents` finds last month's document.
2. `last_business_day` gives the date.
3. `preview_copy` shows exactly what will be issued.
4. You approve, and `emit_document` issues it and returns the new number.

### Example: new receipt

```json
{
  "transactionDate": "2026-10-09",
  "clientNif": "123456789",
  "lines": [
    { "description": "Software development", "quantity": 10, "unit": "H", "unitPrice": 35, "vatRate": 0, "exemptionCode": "133" }
  ],
  "irsRegime": "none"
}
```

- `vatRate`: 23, 13, 6 or 0 (mainland rates). With 0, `exemptionCode` is required, for example `"133"` for the article 53 exemption. A wrong code returns the list of valid codes for that date.
- `unit`: `N/A` (default), `UN`, `MES`, `H`, `D`, `KG`, `T`, `ANO`, `M`, `KM`, `L`, `KWH`.
- `irsRegime`: `none` (default, "Sem retenção - Art.101º, n.º1"), `exempt_101B_ab`, `exempt_101B_c`, `exempt_101B_d`, `non_resident`, `on_100`, `on_25`, `on_50_101D`, `on_50_12A`. For the `on_*` options also give `irsRate`, for example `23`.
- Optional: `notes` (Observações), `activity` (if you have more than one registered activity).

## Safety

- **Two-step issuing.** `emit_document` only works with a token from a preview. It fills the form again, checks that the document is exactly the same as the preview, and only then confirms. A token expires after 15 minutes and works once.
- **Validation without issuing.** The portal's "Emitir" button first calls the AT with `isToValidate: true`. The previews use that call, so the AT checks the document without creating it.
- **No duplicates by default.** `emit_document` refuses if the same client already has a document with the same transaction date, unless you pass `allowDuplicate: true`.
- **Login lockout guard.** The AT locks the account after 5 wrong passwords. The server tries once. If it fails, it writes `~/.cache/financas-pt-mcp/LOGIN_FAILED.lock` and refuses further logins until you fix the password and delete that file.
- **No future dates.** The portal rejects them, and so does the server.
- **Credentials stay local.** They go only to the AT login page.

## Install

Requires Node.js 20 or newer. The first install downloads a headless Chromium (about 120 MB).

Put your credentials in a file that only you can read:

```bash
mkdir -p ~/.config/financas-pt-mcp
printf '%s\n%s\n' 'YOUR_NIF' 'YOUR_PASSWORD' > ~/.config/financas-pt-mcp/credentials
chmod 600 ~/.config/financas-pt-mcp/credentials
```

You can also use the environment variables `FINANCAS_NIF` and `FINANCAS_PASSWORD`, or point `FINANCAS_CREDENTIALS_FILE` to another file.

### Claude Code

```bash
claude mcp add financas -- npx -y github:aamaral14/financas-pt-mcp
```

### Claude Desktop and other MCP clients

```json
{
  "mcpServers": {
    "financas": {
      "command": "npx",
      "args": ["-y", "github:aamaral14/financas-pt-mcp"]
    }
  }
}
```

### From source

```bash
git clone https://github.com/aamaral14/financas-pt-mcp
cd financas-pt-mcp && npm install
claude mcp add financas -- node "$PWD/src/index.mjs"
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `FINANCAS_NIF`, `FINANCAS_PASSWORD` | none | Credentials (take precedence over the file) |
| `FINANCAS_CREDENTIALS_FILE` | `~/.config/financas-pt-mcp/credentials` | File with NIF on line 1 and password on line 2 |
| `FINANCAS_HEADLESS` | `1` | Set `0` to watch the browser |

## Tests

| Command | What it checks | Runs in CI |
|---|---|---|
| `npm test` | Unit tests (dates, holidays, 12-month windows, input validation, preview hash) and MCP protocol tests (tool list, safety annotations, refusals). No browser, no network, no credentials. | Yes, on every pull request, Node 20, 22 and 24 |
| `npm run test:live` | Read-only run against the real portal with your credentials: login, lists, detail, PDF, both previews, catalogue unchanged. **Never issues.** Set `TEST_CLIENT_NIF` to include `preview_new`. | No, only on your machine |

## Contributing

Contributions are welcome. Every pull request that changes `src/` must add or update tests, and the CI pipeline blocks the merge if tests fail or are missing. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request.

## How it works

A headless Chromium logs in to `acesso.gov.pt`. Reads use the portal's JSON endpoints (`/recibos/api/obtemDocumentosV2`, `obtemClientesCatalogo`, `obtemProdutosCatalogo`) and pages (`/recibos/portal/consultar/detalheV2/...`, `/recibos/portal/imprimirV2/...`) with the browser session. To issue, the server fills the portal's own form (a copy via `emitirfaturaV2?idDocumento=...&dataCopia=...`, or a blank form), captures the validation call to `/recibos/api/emitirV2`, and confirms in the portal's own dialog.

## License

MIT
