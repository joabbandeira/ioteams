---
version: 1
kind: stack
id: codex-local
name: Codex local
---
# Codex local

## Propósito

Integrar assistência de desenvolvimento a um ambiente local com ferramentas, sandbox e aprovações do host. Local descreve o processo e seu acesso ao workspace; não promete inferência offline nem ausência de envio de contexto ao provedor.

## Funcionalidades

O [Codex App Server](https://learn.chatgpt.com/docs/app-server) oferece threads, turnos, eventos e tratamento de aprovações. O transporte stdio usa mensagens JSON por linha. Schemas TypeScript ou JSON podem ser gerados pela versão instalada, evitando presumir que toda versão tenha os mesmos campos.

## Vantagens

Em uma integração supervisionada, eventos permitem apresentar progresso e decisões pendentes. Para o ioteams, um adapter independente do domínio facilita testar estados com um host simulado antes de executar um modelo real.

## Desvantagens

Exige tratamento de falhas de processo, autenticação, limites de uso e mudanças de protocolo. Respostas do modelo podem conter erros ou propostas fora do escopo; a aplicação precisa conferir resultados e evidências em vez de confiar no texto de conclusão.

## Casos de uso

Planejamento assistido, implementação em checkout delimitado e revisão. Exemplo fictício: um turno propõe uma correção enquanto o host valida arquivos e checks do plano. Este documento não executa login nem inicia sessão.

## Restrições

Sandbox limita recursos e aprovação controla decisões que exigem consentimento; conhecer a stack não amplia essas fronteiras. [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security). O App Server está sujeito à evolução e aos limites de suporte documentados; a integração deve validar sua versão e adequação antes de uso operacional. [Estado do protocolo](https://learn.chatgpt.com/docs/app-server).

## Boas práticas

Conforme o [design ioteams v1](../../docs/superpowers/specs/2026-10-14-ioteams-v1-design.md), usar runtime dedicado autenticado nativamente, sem copiar credenciais ou reutilizar dados pessoais ativos; separar conhecimento de política executável. Vincular decisões à solicitação pendente, preservar aprovações nativas e reconciliar efeitos incertos. Nenhum texto do corpus pode instalar skills, alterar permissões ou autorizar push.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [App Server](https://learn.chatgpt.com/docs/app-server) e [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security). O nome de modelo é descoberto no ambiente, sem fixá-lo neste repertório.

Contexto: [IA Aplicada](../../profissoes/engenharia-de-ia-aplicada/descricao.md), [Git](../git/descricao.md), [RAG local](../rag-local/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
