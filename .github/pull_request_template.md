## What does this change? / O que muda?

<!-- One or two sentences. / Uma ou duas frases. -->

## Tests / Testes

- [ ] I added or updated tests in `test/` that fail without this change. / Adicionei ou atualizei testes em `test/` que falham sem esta alteração.
- [ ] `npm test` passes locally. / `npm test` passa localmente.
- [ ] If this touches the portal flow, I ran `npm run test:live` with my own account and it **did not issue** any document. / Se mexe no fluxo do portal, corri `npm run test:live` com a minha conta e **não emitiu** nenhum documento.

Output of `npm test` / Resultado de `npm test`:

```
<!-- paste here / cola aqui -->
```

## Safety / Segurança

- [ ] No real NIF, name, address, password, document number or screenshot with personal data in code, tests, logs or this PR. / Sem NIF, nome, morada, senha, número de documento ou captura de ecrã com dados pessoais reais.
- [ ] Nothing new can issue or cancel a document without a preview and `confirm: true`. / Nada de novo pode emitir ou anular um documento sem pré-visualização e `confirm: true`.
