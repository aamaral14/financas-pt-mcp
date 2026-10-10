# Contributing / Contribuir

[English](#english) | [Português](#português)

## English

Thank you for helping. This server issues real tax documents, so the rules below are strict.

### Rule 1: code changes come with tests, when tests make sense

Start the PR title with a [Conventional Commits](https://www.conventionalcommits.org) type, for example `feat: add list of credit notes` or `fix(portal): wrong date format`. The check "Code changes include tests" uses that type:

| Your PR | What the check requires |
|---|---|
| `feat:`, or any title without a type | **New** test cases: the number of active `test(...)` / `it(...)` cases in `test/*.test.mjs` must go up. Editing old tests or adding `.skip`/`.todo` tests does not count. |
| `fix:` (or label `bug`) | At least one file in `test/` changed: a new test, or an updated one that reproduces the bug. For bugs in the portal flow that offline tests cannot reach, updating `test/live-readonly.mjs` counts. |
| `refactor:`, `perf:`, `style:`, `docs:`, `revert:` | No new tests. These must not change behaviour, so the existing tests must still pass. |
| Only comments or whitespace changed in `src/` | Nothing. |
| `src/` only removes code | Nothing. The existing tests must still pass. |
| No change in `src/` (docs, dependencies, CI, tests) | Nothing. |
| Label `no-tests-needed` (maintainers only) | Nothing. For rare cases the rules above do not cover. |

- `chore:`, `build:`, `ci:` and `test:` are not exempt when they change `src/`. Use the type that describes the change.
- Tests must fail without your change and pass with it.
- The pipeline blocks the merge when any test fails on Node 20, 22 or 24, or when this check fails. The error message says what is missing.
- Changing the PR title or labels re-runs only this check.
- Maintainers check that the type is honest: a `refactor:` that changes behaviour will be asked for tests.
- The rules themselves are tested in `test/gate.test.mjs`.

### Rule 2: tests never touch a real account in CI

There are two kinds of tests:

| Command | What it runs | Where |
|---|---|---|
| `npm test` | Unit tests (`test/unit.test.mjs`), MCP protocol tests (`test/mcp.test.mjs`) and tests of the PR rules (`test/gate.test.mjs`). No browser, no network, no credentials. | Locally and in CI, on every PR |
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
4. Open a pull request with a typed title (`feat:`, `fix:`, `refactor:`...) and fill in the template, including the `npm test` output.

## Português

Obrigado por ajudares. Este servidor emite documentos fiscais reais, por isso as regras abaixo são rígidas.

### Regra 1: alterações ao código trazem testes, quando os testes fazem sentido

Começa o título do PR por um tipo [Conventional Commits](https://www.conventionalcommits.org/pt-br/), por exemplo `feat: lista de notas de crédito` ou `fix(portal): formato de data errado`. A verificação "Code changes include tests" usa esse tipo:

| O teu PR | O que a verificação exige |
|---|---|
| `feat:`, ou um título sem tipo | **Novos** casos de teste: o número de casos ativos `test(...)` / `it(...)` em `test/*.test.mjs` tem de aumentar. Editar testes antigos ou adicionar testes `.skip`/`.todo` não conta. |
| `fix:` (ou etiqueta `bug`) | Pelo menos um ficheiro em `test/` alterado: um teste novo, ou um existente atualizado que reproduza o bug. Para bugs no fluxo do portal que os testes offline não alcançam, atualizar o `test/live-readonly.mjs` conta. |
| `refactor:`, `perf:`, `style:`, `docs:`, `revert:` | Nenhum teste novo. Estas alterações não podem mudar o comportamento, por isso os testes existentes têm de continuar a passar. |
| Só comentários ou espaços alterados em `src/` | Nada. |
| `src/` só remove código | Nada. Os testes existentes têm de continuar a passar. |
| Nenhuma alteração em `src/` (documentação, dependências, CI, testes) | Nada. |
| Etiqueta `no-tests-needed` (só maintainers) | Nada. Para casos raros que as regras acima não cobrem. |

- `chore:`, `build:`, `ci:` e `test:` não estão dispensados quando alteram `src/`. Usa o tipo que descreve a alteração.
- Os testes têm de falhar sem a tua alteração e passar com ela.
- A pipeline bloqueia o merge quando algum teste falha em Node 20, 22 ou 24, ou quando esta verificação falha. A mensagem de erro diz o que falta.
- Alterar o título ou as etiquetas do PR volta a correr só esta verificação.
- Os maintainers confirmam que o tipo é honesto: a um `refactor:` que muda o comportamento vão ser pedidos testes.
- As próprias regras estão testadas em `test/gate.test.mjs`.

### Regra 2: os testes nunca usam uma conta real na CI

Há dois tipos de testes:

| Comando | O que corre | Onde |
|---|---|---|
| `npm test` | Testes unitários (`test/unit.test.mjs`), testes do protocolo MCP (`test/mcp.test.mjs`) e testes das regras dos PRs (`test/gate.test.mjs`). Sem browser, sem rede, sem credenciais. | No teu computador e na CI, em cada PR |
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
4. Abre um pull request com um título com tipo (`feat:`, `fix:`, `refactor:`...) e preenche o modelo, incluindo o resultado do `npm test`.
