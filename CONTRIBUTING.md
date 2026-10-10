# Contributing / Contribuir

[English](#english) | [Português](#português)

## English

Thank you for helping. This server issues real tax documents, so the rules below are strict.

### Rule 1: every contribution comes with tests

- Every pull request that changes code in `src/` **must** add or update tests in `test/`.
- The tests must fail without your change and pass with it.
- The CI pipeline runs on every pull request and blocks the merge when:
  - any test fails on Node 20, 22 or 24, or
  - `src/` changed but `test/` did not (check "Code changes include tests").
- Only a maintainer can waive the test rule, with the label `no-tests-needed` (for example, a comment-only change).

### Rule 2: tests never touch a real account in CI

There are two kinds of tests:

| Command | What it runs | Where |
|---|---|---|
| `npm test` | Unit tests (`test/unit.test.mjs`) and MCP protocol tests (`test/mcp.test.mjs`). No browser, no network, no credentials. | Locally and in CI, on every PR |
| `npm run test:live` | Read-only run against the real portal with your own credentials. Never issues a document. | Only on your machine |

- Put pure logic (dates, validation, payload mapping) in functions that `npm test` can cover without the portal.
- If you change how the server talks to the portal, also run `npm run test:live` with your own account and say so in the PR. Set `TEST_CLIENT_NIF` to also test `preview_new`.
- Never add a test that calls `emit_document` with a real token.

### Rule 3: safety and privacy

- Any new action that changes data at the AT (issue, cancel, credit note) must use the same two steps: a preview validated by the portal, then a separate call with `confirm: true` that re-checks the preview.
- Never commit a real NIF, name, address, password, document number, ATCUD or screenshot of a real account. Use `123456789` and invented names in tests and examples.
- Login must stay at one attempt per lock. Do not add retries on login failure.

### How to submit

1. Fork the repo and create a branch.
2. `npm install`, make your change, add tests.
3. `npm test` must pass.
4. Open a pull request and fill in the template, including the `npm test` output.

## Português

Obrigado por ajudares. Este servidor emite documentos fiscais reais, por isso as regras abaixo são rígidas.

### Regra 1: cada contribuição traz testes

- Cada pull request que altera código em `src/` **tem de** adicionar ou atualizar testes em `test/`.
- Os testes têm de falhar sem a tua alteração e passar com ela.
- A pipeline de CI corre em cada pull request e bloqueia o merge quando:
  - algum teste falha em Node 20, 22 ou 24, ou
  - `src/` mudou mas `test/` não (verificação "Code changes include tests").
- Só um maintainer pode dispensar a regra dos testes, com a etiqueta `no-tests-needed` (por exemplo, uma alteração só a comentários).

### Regra 2: os testes nunca usam uma conta real na CI

Há dois tipos de testes:

| Comando | O que corre | Onde |
|---|---|---|
| `npm test` | Testes unitários (`test/unit.test.mjs`) e testes do protocolo MCP (`test/mcp.test.mjs`). Sem browser, sem rede, sem credenciais. | No teu computador e na CI, em cada PR |
| `npm run test:live` | Teste só de leitura no portal real com as tuas credenciais. Nunca emite documentos. | Só no teu computador |

- Põe a lógica pura (datas, validação, conversão de dados) em funções que o `npm test` consiga testar sem o portal.
- Se alterares a forma como o servidor fala com o portal, corre também `npm run test:live` com a tua conta e indica-o no PR. Define `TEST_CLIENT_NIF` para testar também o `preview_new`.
- Nunca adiciones um teste que chame o `emit_document` com um token real.

### Regra 3: segurança e privacidade

- Qualquer nova ação que altere dados na AT (emitir, anular, nota de crédito) tem de usar os mesmos dois passos: uma pré-visualização validada pelo portal e depois uma chamada separada com `confirm: true` que volta a verificar a pré-visualização.
- Nunca faças commit de NIF, nome, morada, senha, número de documento, ATCUD ou captura de ecrã de uma conta real. Usa `123456789` e nomes inventados nos testes e exemplos.
- O login tem de continuar a ser uma tentativa por bloqueio. Não adiciones novas tentativas quando o login falha.

### Como submeter

1. Faz fork do repositório e cria um branch.
2. `npm install`, faz a alteração, adiciona testes.
3. `npm test` tem de passar.
4. Abre um pull request e preenche o modelo, incluindo o resultado do `npm test`.
