# Painel LISA

Protótipo interativo do ioteams, com equipe, eventos Scrum, objetivos e quadro de tarefas. Inclui modo claro e escuro. Todos os dados são fictícios e as alterações são descartadas ao recarregar a página.

O [guia de execução e publicação](../docs/como-executar-e-publicar-o-painel.md) explica as opções para usar o HTML pronto, recompilar o código e hospedar o painel.

## Executar o HTML pronto

Com Node.js 22 ou superior, a partir deste diretório:

```bash
npm start
```

Abra `http://127.0.0.1:3000/`. O comando usa o HTML já incluído em `docs/index.html` e não requer instalação de dependências.

## Recompilar

```bash
npm ci
npm run typecheck
npm run build
npm start
```

A compilação reúne JavaScript e CSS em `docs/index.html`. Depois de alterar as fontes, recompile e recarregue o navegador. Não há recompilação automática.

## Arquivos

| Caminho | Função |
| --- | --- |
| [src/app.tsx](src/app.tsx) | Interface e interações do painel. |
| [src/model.ts](src/model.ts) | Pessoas, tarefas, eventos e regras fictícias da demonstração. |
| [src/styles.css](src/styles.css) | Estilos, responsividade e temas claro e escuro. |
| [src/components/ui/](src/components/ui/) | Componentes shadcn/ui utilizados na interface. |
| [src/lib/utils.ts](src/lib/utils.ts) | Utilitários de classes dos componentes. |
| `build.mjs` | Compilação com Tailwind CSS e esbuild. |
| `serve.mjs` | Servidor local de pré-visualização. |
| `package-lock.json` | Versões resolvidas para instalação com `npm ci`. |
| `../docs/index.html` | Artefato estático pronto para execução e hospedagem. |

O protótipo usa React, TypeScript, Tailwind CSS, shadcn/ui e Radix UI. Não possui backend, banco de dados, autenticação, RAG ou execução de agentes.

[Voltar à visão geral](../README.md)
