---
version: 1
kind: stack
id: github-actions
name: GitHub Actions
---
# GitHub Actions

## Propósito

Automatizar verificações e outros fluxos de repositório a partir de eventos configurados. A [visão geral oficial](https://docs.github.com/en/actions/get-started/understand-github-actions) distingue workflows, jobs, steps, actions e runners.

## Funcionalidades

Definir workflows em YAML, executar jobs em runners e ordenar steps de comandos ou actions reutilizáveis. Jobs podem depender de outros jobs; seus resultados permitem construir um fluxo de validação. [Componentes do Actions](https://docs.github.com/en/actions/get-started/understand-github-actions).

## Vantagens

Em projetos com entrega por Git, checks reproduzíveis dão feedback sobre revisões específicas. No ioteams, CI por marcos pode verificar contratos e adapters simulados sem depender de credenciais de modelo ou de dados pessoais.

## Desvantagens

Tempo, capacidade e custos variam com o runner e a conta. Dependências remotas e diferenças do ambiente podem dificultar reprodução local. Uma action comprometida pode afetar os recursos disponíveis ao job.

## Casos de uso

Typecheck, testes e construção de artefatos em revisões selecionadas. Exemplo fictício: um marco do projeto dispara validação da mesma árvore previamente testada localmente, sem habilitar publicação automática de produto.

## Restrições

Checks aprovados não concedem autorização para deploy ou alteração de branch protegida. Código e artefatos não confiáveis precisam de fronteiras explícitas; workflows privilegiados que obtêm código externo podem expor credenciais. [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use). A menção da stack não autoriza criar workflows, runners ou secrets na conta.

## Boas práticas

Aplicar menor privilégio ao token, revisar ações e fixar suas dependências em referências verificáveis; a documentação atual descreve lockfiles e, quando não adotados, pinagem por SHA completo. Não interpolar conteúdo não confiável na geração de scripts nem presumir que toda saída sensível será mascarada. [Práticas oficiais](https://docs.github.com/en/actions/reference/security/secure-use). No ioteams v1, respeitar CI somente nas tags de marco previstas no plano e verificar o resultado no SHA correspondente.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions) e [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use). Disponibilidade e políticas devem ser verificadas no repositório alvo.

Contexto: [Git](../git/descricao.md), [DevOps](../../profissoes/devops/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
