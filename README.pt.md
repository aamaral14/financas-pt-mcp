<p align="center">
  <img src="assets/logo.svg" width="120" alt="logótipo financas-pt-mcp">
</p>

<h1 align="center">financas-pt-mcp</h1>

<p align="center">
  Português | <a href="README.md">English</a>
  <br><br>
  <a href="https://github.com/aamaral14/financas-pt-mcp/actions/workflows/ci.yml"><img src="https://github.com/aamaral14/financas-pt-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+">
</p>

Servidor [MCP](https://modelcontextprotocol.io) não oficial para o Portal das Finanças, área "Faturas e Recibos" (recibos verdes). Permite a um assistente de IA, como o Claude, consultar as tuas faturas e emitir novas com segurança.

> **Não oficial.** Este projeto não tem ligação à Autoridade Tributária e Aduaneira (AT). A AT não tem uma API pública para isto. O servidor usa a mesma aplicação web que usas no browser, por isso pode deixar de funcionar quando o portal mudar. Cada documento emitido é um documento fiscal real. Usa por tua conta e risco.

## O que faz hoje

**Consultar a tua conta**
- Lista as faturas e recibos que emitiste, com filtros (datas, cliente, estado). Divide sozinho intervalos maiores que 12 meses.
- Mostra o detalhe completo de um documento e descarrega o PDF oficial.
- Lista os clientes e os produtos/serviços guardados no teu catálogo.

**Emitir uma Fatura-Recibo, em dois passos seguros**
- Por cópia: mesmo cliente, linhas, IVA e IRS de um documento existente, com uma nova data da transação. Ideal para recibos mensais.
- De raiz: indicas o NIF do cliente e as linhas. O portal preenche o nome e a morada do cliente e calcula os totais.
- Primeiro uma pré-visualização, que o servidor das Finanças valida **sem emitir**. Depois, só com a tua confirmação explícita, a emissão real.

**Ajudas**
- Último dia útil de um mês em Portugal (sem fins de semana nem feriados nacionais).

**Ainda não faz:** Faturas (só Faturas-Recibo), anular, notas de crédito, clientes estrangeiros, documentos recebidos, login com Cartão de Cidadão ou Chave Móvel Digital.

## Ferramentas

| Ferramenta | O que faz | Altera dados? |
|---|---|---|
| `login` | Entra com o teu NIF e senha. Só uma tentativa (ver Segurança). | Não |
| `list_documents` | Documentos que emitiste, do mais recente para o mais antigo. Filtros: `from`, `to`, `clientNif`, `status`. | Não |
| `get_document` | Detalhe completo de um documento: cliente, linhas, IVA, IRS, totais. | Não |
| `download_pdf` | Guarda o PDF oficial de um documento. | Só um ficheiro local |
| `list_clients` | Clientes do teu catálogo. | Não |
| `list_products` | Produtos e serviços do teu catálogo. | Não |
| `preview_copy` | Prepara uma cópia de um documento com nova data da transação. Validada pela AT, **não emite nada**. Devolve um `previewToken`. | Não |
| `preview_new` | Prepara uma nova Fatura-Recibo de raiz. Validada pela AT, **não emite nada**. Devolve um `previewToken`. | Não |
| `emit_document` | **Emite** um documento pré-visualizado. Precisa do `previewToken` e de `confirm: true`. | **Sim, emite um documento real** |
| `last_business_day` | Último dia útil de um mês em Portugal. | Não |

### Exemplo: recibo mensal

> "Emite o recibo deste mês para o cliente X, igual ao do mês passado, com a data do último dia útil."

1. `list_documents` encontra o documento do mês passado.
2. `last_business_day` dá a data.
3. `preview_copy` mostra exatamente o que vai ser emitido.
4. Aprovas, e `emit_document` emite-o e devolve o novo número.

### Exemplo: recibo novo

```json
{
  "transactionDate": "2026-10-09",
  "clientNif": "123456789",
  "lines": [
    { "description": "Desenvolvimento de software", "quantity": 10, "unit": "H", "unitPrice": 35, "vatRate": 0, "exemptionCode": "133" }
  ],
  "irsRegime": "none"
}
```

- `vatRate`: 23, 13, 6 ou 0 (taxas do continente). Com 0, o `exemptionCode` é obrigatório, por exemplo `"133"` para a isenção do artigo 53.º. Um código errado devolve a lista de códigos válidos para essa data.
- `unit`: `N/A` (por defeito), `UN`, `MES`, `H`, `D`, `KG`, `T`, `ANO`, `M`, `KM`, `L`, `KWH`.
- `irsRegime`: `none` (por defeito, "Sem retenção - Art.101º, n.º1"), `exempt_101B_ab`, `exempt_101B_c`, `exempt_101B_d`, `non_resident`, `on_100`, `on_25`, `on_50_101D`, `on_50_12A`. Nas opções `on_*` indica também `irsRate`, por exemplo `23`.
- Opcional: `notes` (Observações), `activity` (se tiveres mais do que uma atividade registada).

## Segurança

- **Emissão em dois passos.** O `emit_document` só funciona com um token de uma pré-visualização. Volta a preencher o formulário, confirma que o documento é exatamente igual ao da pré-visualização e só depois confirma. O token expira ao fim de 15 minutos e só serve uma vez.
- **Validação sem emitir.** O botão "Emitir" do portal chama primeiro a AT com `isToValidate: true`. As pré-visualizações usam essa chamada, por isso a AT verifica o documento sem o criar.
- **Sem duplicados por defeito.** O `emit_document` recusa se o mesmo cliente já tiver um documento com a mesma data da transação, a não ser que passes `allowDuplicate: true`.
- **Proteção contra bloqueio.** A AT bloqueia a conta ao fim de 5 senhas erradas. O servidor tenta uma vez. Se falhar, cria `~/.cache/financas-pt-mcp/LOGIN_FAILED.lock` e recusa novos logins até corrigires a senha e apagares esse ficheiro.
- **Sem datas futuras.** O portal não as aceita, e o servidor também não.
- **As credenciais ficam no teu computador.** Só são enviadas para a página de login da AT.

## Instalação

Precisa de Node.js 20 ou mais recente. A primeira instalação descarrega um Chromium sem janela (cerca de 120 MB).

Guarda as credenciais num ficheiro que só tu podes ler:

```bash
mkdir -p ~/.config/financas-pt-mcp
printf '%s\n%s\n' 'O_TEU_NIF' 'A_TUA_SENHA' > ~/.config/financas-pt-mcp/credentials
chmod 600 ~/.config/financas-pt-mcp/credentials
```

Também podes usar as variáveis de ambiente `FINANCAS_NIF` e `FINANCAS_PASSWORD`, ou apontar `FINANCAS_CREDENTIALS_FILE` para outro ficheiro.

### Claude Code

```bash
claude mcp add financas -- npx -y github:aamaral14/financas-pt-mcp
```

### Claude Desktop e outros clientes MCP

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

### A partir do código

```bash
git clone https://github.com/aamaral14/financas-pt-mcp
cd financas-pt-mcp && npm install
claude mcp add financas -- node "$PWD/src/index.mjs"
```

## Configuração

| Variável | Valor por defeito | Significado |
|---|---|---|
| `FINANCAS_NIF`, `FINANCAS_PASSWORD` | nenhum | Credenciais (têm prioridade sobre o ficheiro) |
| `FINANCAS_CREDENTIALS_FILE` | `~/.config/financas-pt-mcp/credentials` | Ficheiro com o NIF na linha 1 e a senha na linha 2 |
| `FINANCAS_HEADLESS` | `1` | Põe `0` para ver o browser |

## Testes

| Comando | O que verifica | Corre na CI |
|---|---|---|
| `npm test` | Testes unitários (datas, feriados, janelas de 12 meses, validação de dados, hash da pré-visualização) e testes do protocolo MCP (lista de ferramentas, marcações de segurança, recusas). Sem browser, sem rede, sem credenciais. | Sim, em cada pull request, Node 20, 22 e 24 |
| `npm run test:live` | Teste só de leitura no portal real com as tuas credenciais: login, listas, detalhe, PDF, as duas pré-visualizações, catálogo inalterado. **Nunca emite.** Define `TEST_CLIENT_NIF` para incluir o `preview_new`. | Não, só no teu computador |

## Contribuir

Contribuições são bem-vindas. Cada pull request que altera `src/` tem de adicionar ou atualizar testes, e a pipeline de CI bloqueia o merge se os testes falharem ou faltarem. Lê o [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrires um pull request.

## Como funciona

Um Chromium sem janela faz login em `acesso.gov.pt`. As leituras usam os endpoints JSON do portal (`/recibos/api/obtemDocumentosV2`, `obtemClientesCatalogo`, `obtemProdutosCatalogo`) e as páginas (`/recibos/portal/consultar/detalheV2/...`, `/recibos/portal/imprimirV2/...`) com a sessão do browser. Para emitir, o servidor preenche o próprio formulário do portal (uma cópia via `emitirfaturaV2?idDocumento=...&dataCopia=...`, ou um formulário em branco), captura a chamada de validação a `/recibos/api/emitirV2` e confirma no diálogo do próprio portal.

## Licença

MIT
