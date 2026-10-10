# financas-pt-mcp

Português | [English](README.md)

Servidor [MCP](https://modelcontextprotocol.io) não oficial para o Portal das Finanças, área "Faturas e Recibos" (recibos verdes). Permite a um assistente de IA, como o Claude, listar as faturas que emitiste, ver o detalhe, descarregar o PDF oficial e emitir uma nova Fatura-Recibo a partir de uma já existente.

> **Não oficial.** Este projeto não tem ligação à Autoridade Tributária e Aduaneira (AT). A AT não tem uma API pública para isto. O servidor usa a mesma aplicação web que usas no browser, por isso pode deixar de funcionar quando o portal mudar. Cada documento emitido é um documento fiscal real. Usa por tua conta e risco.

## Ferramentas

| Ferramenta | O que faz | Altera dados? |
|---|---|---|
| `login` | Entra com o teu NIF e senha. Só uma tentativa (ver Segurança). | Não |
| `list_documents` | Lista os documentos que emitiste, do mais recente para o mais antigo. Filtra por datas, NIF do cliente e estado. Divide sozinho intervalos maiores que 12 meses (o limite do portal). | Não |
| `get_document` | Detalhe completo de um documento: cliente, linhas, IVA, IRS, totais. | Não |
| `download_pdf` | Guarda o PDF oficial de um documento. | Só um ficheiro local |
| `preview_copy` | Prepara uma cópia de um documento com uma nova data da transação. O servidor da AT valida-a. **Não emite nada.** Devolve um resumo, possíveis duplicados e um `previewToken`. | Não |
| `emit_copy` | **Emite** o documento pré-visualizado. Precisa do `previewToken` e de `confirm: true`. | **Sim, emite um documento real** |
| `last_business_day` | Último dia útil de um mês em Portugal (sem fins de semana nem feriados nacionais). | Não |

Fluxo mensal típico: "Emite o recibo deste mês para o cliente X, igual ao do mês passado, com a data do último dia útil."

1. `list_documents` encontra o documento do mês passado.
2. `last_business_day` dá a data.
3. `preview_copy` mostra exatamente o que vai ser emitido.
4. Aprovas, e `emit_copy` emite-o e devolve o novo número.

## Segurança

- **Emissão em dois passos.** `emit_copy` só funciona com um token do `preview_copy`. Volta a abrir o formulário, confirma que o documento é exatamente igual ao da pré-visualização e só depois confirma. O token expira ao fim de 15 minutos e só serve uma vez.
- **Validação na AT sem emitir.** O próprio botão "Emitir" do portal chama primeiro a AT com `isToValidate: true`. O `preview_copy` usa essa chamada, por isso a AT verifica o documento sem o criar.
- **Sem duplicados por defeito.** O `emit_copy` recusa se o mesmo cliente já tiver um documento com a mesma data da transação, a não ser que passes `allowDuplicate: true`.
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

```bash
npm test                      # testes unitários (datas, janelas de 12 meses, hash do pedido)
npm run test:live             # teste real SÓ DE LEITURA no portal (nunca emite)
```

## Limitações conhecidas

- Só documentos **que emitiste** (prestador). Os documentos recebidos não estão incluídos.
- A emissão é por cópia: o novo documento tem o mesmo cliente, linhas, IVA e IRS de um documento existente. Emitir do zero, anular e notas de crédito ainda não estão feitos.
- A AT às vezes muda códigos. Exemplo: a partir de agosto de 2026, a isenção de IVA do artigo 53.º passou do código interno 122 para o 133. O portal aplica o código válido para a data da transação, por isso uma cópia pode mostrar um código diferente do original. O `preview_copy` mostra o código antes de emitires.
- Login só com NIF e senha (sem Cartão de Cidadão nem Chave Móvel Digital).

## Como funciona

Um Chromium sem janela faz login em `acesso.gov.pt`. As leituras usam os endpoints JSON do portal (`/recibos/api/obtemDocumentosV2`) e as páginas (`/recibos/portal/consultar/detalheV2/...`, `/recibos/portal/imprimirV2/...`) com a sessão do browser. A emissão abre o formulário "Emitir novo" do portal (`/recibos/portal/emitir/emitirfaturaV2?idDocumento=...&dataCopia=...`), captura a chamada de validação a `/recibos/api/emitirV2` e confirma no diálogo do próprio portal.

## Licença

MIT
