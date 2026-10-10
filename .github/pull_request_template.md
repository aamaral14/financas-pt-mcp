<!-- Title / Título: feat: | fix: | refactor: | perf: | style: | docs: | revert: ... (see/ver CONTRIBUTING.md) -->

## What does this change? / O que muda?

<!-- One or two sentences. / Uma ou duas frases. -->

## Tests / Testes

Tick the one that applies / Marca o que se aplica:

- [ ] `feat:` I added **new** test cases that fail without this change. / Adicionei **novos** casos de teste que falham sem esta alteração.
- [ ] `fix:` I added or updated a test that reproduces the bug. / Adicionei ou atualizei um teste que reproduz o bug.
- [ ] `refactor:` / `perf:` / `style:` / `docs:` / `revert:` No behaviour change; existing tests pass. / Sem mudança de comportamento; os testes existentes passam.
- [ ] No change in `src/`. / Sem alterações em `src/`.
- [ ] `npm test` passes locally. / `npm test` passa localmente.
- [ ] If this touches the portal flow, I ran `npm run test:live` with my own account and it **did not issue** any document. / Se mexe no fluxo do portal, corri `npm run test:live` com a minha conta e **não emitiu** nenhum documento.

Output of `npm test` / Resultado de `npm test`:

```
<!-- paste here / cola aqui -->
```

## Safety / Segurança

- [ ] No real NIF, name, address, password, document number or screenshot with personal data in code, tests, logs or this PR. / Sem NIF, nome, morada, senha, número de documento ou captura de ecrã com dados pessoais reais.
- [ ] Nothing new can issue or cancel a document without a preview and `confirm: true`. / Nada de novo pode emitir ou anular um documento sem pré-visualização e `confirm: true`.
