# financas-pt-mcp

[Português](README.pt.md) | English

Unofficial [MCP](https://modelcontextprotocol.io) server for the Portuguese tax portal (Portal das Finanças), section "Faturas e Recibos" (recibos verdes). It lets an AI assistant such as Claude list your issued invoices, read them, download the official PDF, and issue a new Fatura-Recibo copied from an existing one.

> **Unofficial.** This project is not affiliated with the Autoridade Tributária e Aduaneira (AT). The AT has no public API for this. The server drives the same web app you use in the browser, so it can break when the portal changes. Every document it issues is a real tax document. Use it at your own risk.

## Tools

| Tool | What it does | Changes data? |
|---|---|---|
| `login` | Logs in with your NIF and password. One attempt only (see Safety). | No |
| `list_documents` | Lists the documents you issued, newest first. Filter by date, client NIF, status. Splits ranges over 12 months automatically (the portal limit). | No |
| `get_document` | Full detail of one document: client, lines, VAT, IRS, totals. | No |
| `download_pdf` | Saves the official PDF of a document. | Local file only |
| `preview_copy` | Prepares a copy of an existing document with a new transaction date. The AT server validates it. **Nothing is issued.** Returns a summary, possible duplicates and a `previewToken`. | No |
| `emit_copy` | **Issues** the previewed document. Needs `previewToken` and `confirm: true`. | **Yes, issues a real document** |
| `last_business_day` | Last business day of a month in Portugal (weekends and national holidays excluded). | No |

Typical monthly flow: "Issue this month's receipt for client X, the same as last month, dated the last business day."

1. `list_documents` finds last month's document.
2. `last_business_day` gives the date.
3. `preview_copy` shows exactly what will be issued.
4. You approve, then `emit_copy` issues it and returns the new number.

## Safety

- **Two-step issuing.** `emit_copy` only works with a token from `preview_copy`. It opens the form again, checks that the document is byte-for-byte the same as the preview, and only then confirms. A token expires after 15 minutes and works once.
- **Server-side validation without issuing.** The portal's own "Emitir" button first calls the AT with `isToValidate: true`. `preview_copy` uses that call, so the AT checks the document without creating it.
- **No duplicates by default.** `emit_copy` refuses if the same client already has a document with the same transaction date, unless you pass `allowDuplicate: true`.
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

```bash
npm test                      # unit tests (dates, 12-month windows, payload hash)
npm run test:live             # live, READ-ONLY run against the real portal (never issues)
```

## Known limits

- Only documents **you issued** (prestador). Documents received are not covered.
- Issuing is copy-based: the new document has the same client, lines, VAT and IRS as an existing one. Issuing from scratch, cancelling (anular) and credit notes are not implemented yet.
- The AT sometimes changes codes. Example: from August 2026 the VAT exemption for article 53 changed from internal code 122 to 133. The portal applies the code valid for the transaction date, so a copy can show a different code from its source. `preview_copy` shows the code before you issue.
- Login with NIF and password only (no Cartão de Cidadão or Chave Móvel Digital).

## How it works

A headless Chromium logs in to `acesso.gov.pt`. Reads use the portal's JSON endpoints (`/recibos/api/obtemDocumentosV2`) and pages (`/recibos/portal/consultar/detalheV2/...`, `/recibos/portal/imprimirV2/...`) with the browser session. Issuing opens the portal's "Emitir novo" form (`/recibos/portal/emitir/emitirfaturaV2?idDocumento=...&dataCopia=...`), captures the validation call to `/recibos/api/emitirV2`, and confirms in the portal's own dialog.

## License

MIT
