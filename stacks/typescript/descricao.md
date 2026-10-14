---
version: 1
kind: stack
id: typescript
name: TypeScript
---
# TypeScript

## Propósito

Descrever e verificar estaticamente contratos de programas JavaScript. O [Handbook](https://www.typescriptlang.org/docs/handbook/2/basic-types.html) explica como o compilador detecta usos incompatíveis antes da execução.

## Funcionalidades

Modelar objetos, funções e uniões de estados; inferir tipos e refinar valores por verificações de controle de fluxo. Uniões discriminadas permitem tratar variantes explicitamente, como eventos de uma execução. O [guia de narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) mostra refinamento e verificação de exaustividade com `never`.

## Vantagens

Em projetos com interfaces compartilhadas, ajuda a detectar incompatibilidades durante refatorações e oferece navegação pelo editor. No ioteams, contratos comuns entre domínio, catálogo e painel reduzem interpretações diferentes do mesmo payload.

## Desvantagens

Tipos complexos podem tornar mensagens de erro difíceis e elevar o custo de manutenção. Declarações incorretas de bibliotecas ou uso amplo de `any` diminuem a utilidade da verificação. O time precisa manter configuração de compilação coerente com o runtime.

## Casos de uso

APIs entre pacotes, componentes [React](../react/descricao.md) e modelagem de estados. Exemplo fictício: distinguir uma execução bloqueada de uma concluída e exigir que cada consumidor trate ambas de forma explícita.

## Restrições

Anotações de tipo são removidas na emissão de JavaScript; uma asserção de tipo não valida JSON recebido nem concede confiança a arquivos. [Tipos apagados em runtime](https://www.typescriptlang.org/docs/handbook/2/basic-types.html). Contratos de controle precisam também de validação em tempo de execução, e o resultado do typecheck não substitui testes de comportamento.

## Boas práticas

Receber dados externos como `unknown`, validar a fronteira e só então usar o tipo correspondente. Manter uniões pequenas, discriminar variantes e preferir inferência quando legível. No ioteams, rejeitar campos de controle desconhecidos e preservar o número de versão dos contratos; mudanças incompatíveis exigem migração explícita.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [The Basics](https://www.typescriptlang.org/docs/handbook/2/basic-types.html) e [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Contexto: [Desenvolvimento de Sistemas](../../profissoes/desenvolvimento-de-sistemas/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md). Conhecer a linguagem não autoriza executar código recuperado do corpus.
