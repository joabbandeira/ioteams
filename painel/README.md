# Painel LISA

Protótipo interativo do ioteams, com equipe, eventos Scrum, objetivos e quadro de tarefas. Inclui modo claro e escuro. Todos os dados são fictícios e as alterações são descartadas ao recarregar a página.

O [guia de execução e publicação](../docs/como-executar-e-publicar-o-painel.md) explica as opções de prévia, build e hospedagem.

## Executar o HTML aprovado

Com Node.js 24, a partir deste diretório:

```bash
npm start
```

Abra `http://127.0.0.1:3000/`. Esse comando serve o HTML já incluído em `docs/index.html` e não precisa de instalação de dependências.

## Desenvolver e verificar

A instalação usa npm workspaces e um único [lockfile na raiz](../package-lock.json). Use Node.js 24 e npm 11. A partir da raiz do repositório:

```bash
npm ci
npm run typecheck
npm test
npm run docs:check
npm run build
npm run preview
```

`build` gera `painel/dist/index.html`, ignorado pelo Git. `preview` serve essa compilação em `http://127.0.0.1:3000/`; recompile e recarregue a página depois de alterar as fontes. Não há recompilação automática.

Também é possível executar `npm ci`, `npm run typecheck`, `npm run build` e `npm run preview` dentro de `painel/`. O npm encontra o workspace e o lockfile raiz. Evite `npm --prefix painel ci`, que força uma instalação isolada sem o lockfile compartilhado.

Na raiz, `npm run test:unit` e `npm run test:integration` executam os subconjuntos existentes. Um subconjunto sem testes informa indisponibilidade e termina com código 2. Para os testes reais de navegador:

```bash
npm run browser:install
npm run test:e2e
```

O Chromium fica em `node_modules/playwright-core/.local-browsers/`. O E2E compila e inicia sua própria prévia loopback na porta 4173, sem usar servidor já aberto. O teste cobre LISA, abertura de tarefa, critérios DONE, reprovação com motivo e replanejamento com preservação do histórico.

## Gerar o demo para publicação

Na raiz:

```bash
npm run build:demo
```

Esse comando atualiza explicitamente `docs/index.html`. Revise o diff antes de publicar. `npm start` em `painel/` continua exibindo esse HTML aprovado; `npm run preview` exibe o build local em `dist/`.

## Arquivos

| Caminho | Função |
| --- | --- |
| [src/app.tsx](src/app.tsx) | Interface e interações do painel. |
| [src/model.ts](src/model.ts) | Pessoas, tarefas, eventos e regras fictícias. |
| [src/styles.css](src/styles.css) | Estilos, responsividade e temas. |
| [src/components/ui/](src/components/ui/) | Componentes shadcn/ui. |
| [src/lib/utils.ts](src/lib/utils.ts) | Utilitários de classes. |
| [build.mjs](build.mjs) | Compilação com Tailwind CSS e esbuild. |
| [serve.mjs](serve.mjs) | Servidor do HTML aprovado. |
| [../scripts/preview.mjs](../scripts/preview.mjs) | Servidor da compilação local. |
| [../packages/core/src/index.ts](../packages/core/src/index.ts) | Contratos Zod/TypeScript compartilhados. |
| [../packages/catalog/src/index.ts](../packages/catalog/src/index.ts) | Leitura declarativa e validação do catálogo. |
| `../docs/index.html` | Artefato estático pronto para hospedagem. |

O protótipo usa React, TypeScript, Tailwind CSS, shadcn/ui e Radix UI. Ele não executa agentes. A camada de contratos e catálogo é independente da simulação.

[Voltar à visão geral](../README.md)
