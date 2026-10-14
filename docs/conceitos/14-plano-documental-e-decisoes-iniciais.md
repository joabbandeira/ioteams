# 14 — Plano documental e decisões iniciais

[Visão geral do projeto](../../README.md)

Este documento consolida as decisões iniciais da ideia. A base organiza o conhecimento e a atuação em Markdown, mantendo a execução por agentes e o acoplamento operacional como direção futura.

## Escopo da camada

- O ioteams será uma camada opcional, acoplável e desacoplável de um workflow de agentes autônomos.
- O workflow hospedeiro poderá existir e funcionar sem essa camada.
- Cada profissional será representado por um agente na implementação futura.
- O projeto organiza conhecimentos e atuação; não define o workflow completo.
- Dentro do modelo de equipe do ioteams, Scrum estará presente.

## Entidades e diretórios principais

As quatro entidades principais são profissões, profissionais, equipes e stacks. A arquitetura de domínio usa os seguintes diretórios de primeiro nível:

```text
profissoes/
profissionais/
equipes/
stacks/
```

`profissoes/` é o agrupador direto das seis profissões. Não há uma entidade intermediária de áreas na organização canônica.

## Profissões e estrutura interna

| Profissão | Diretórios de conteúdo |
| --- | --- |
| Metodologia Ágil Scrum | `papeis/`, `eventos/`, `artefatos/`, `referencias/` |
| Desenvolvimento de Sistemas | `disciplinas/`, `ciclos/`, `artefatos/`, `referencias/` |
| DevOps | `pilares/`, `ciclos/`, `artefatos/`, `referencias/` |
| Engenharia de Software | `pilares/`, `ciclos/`, `artefatos/`, `referencias/` |
| Engenharia de IA Aplicada | `pilares/`, `ciclos/`, `artefatos/`, `referencias/` |
| Engenharia de IA Generativa | `pilares/`, `ciclos/`, `artefatos/`, `referencias/` |

Cada profissão também possui `descricao.md`. Os diretórios de profissões são preservados diretamente no segundo nível, com seus nomes em minúsculas e kebab-case, conforme os [conceitos 02](02-profissoes.md) e [03](03-organizacao-das-profissoes.md).

`pilares/` é o agrupamento físico para DevOps e as engenharias. Fundamentos e dimensões continuam sendo formas de explicar os assuntos dentro desse conteúdo, sem exigir diretórios paralelos com esses nomes.

Engenharia de IA Generativa e Engenharia de IA Aplicada compartilham a estrutura, mas têm conteúdo específico. Para IA Generativa, a cobertura conceitual contempla modelos e modalidades, contexto e prompts, recuperação de informações, adaptação de modelos, avaliações, operação e governança. Esses assuntos não significam adoção de fornecedores ou ferramentas particulares.

## Profissionais

Cada profissional terá `perfil.md`, `personalidade.md`, `conhecimentos.md`, `curriculo.md` e `referencias/`, conforme o [conceito 05](05-documentacao-dos-profissionais.md).

A identidade é independente de equipe fixa, sessão, conversa ou execução. Identificadores de threads e sessões não compõem o perfil permanente. Os conhecimentos apontam para stacks compartilhadas, e as experiências descritas devem respeitar a natureza real ou fictícia do profissional.

## Equipes

Cada equipe terá `descricao.md`, `integrantes.md`, `responsabilidades.md` e `interfaces.md`. Sua composição responde à demanda e combina as capacidades necessárias.

A base inicial contempla apenas a equipe fictícia LISA como exemplo. Não estabelece um catálogo de equipes fixas por profissão.

O desenho usa uma equipe Scrum integrada, com um Product Owner, um Scrum Master e Developers. Os profissionais técnicos necessários à demanda compõem Developers, sem uma equipe Scrum central separada das pessoas que executam o trabalho.

## Stacks

Stacks descrevem habilidades, conhecimentos, técnicas e ferramentas usados na atuação. Podem ser criadas conforme a demanda e devem explicar propósito, funcionalidades, vantagens, desvantagens, aplicação, limitações, práticas e referências, conforme o [conceito 04](04-stacks.md).

A associação de uma stack ao profissional documenta uma capacidade esperada, sem conceder permissões operacionais.

## Dinâmica de trabalho

- Product Goal, Product Backlog e gestão de valor orientam a direção do produto.
- Sprint Goal, Sprint Backlog e Developers orientam o plano de execução da Sprint.
- Incremento e Definition of Done sustentam o entendimento compartilhado de conclusão e qualidade.
- Sprint Planning, Daily Scrum, Sprint Review e Sprint Retrospective organizam a inspeção e a adaptação.
- Etapas e tarefas ajudam a representar o trabalho no painel.
- O quadro usa `TODO`, `IN PLANNING`, `READY`, `BLOCKED`, `IN PROGRESS`, `REJECTED` e `DONE` como convenções próprias.
- Uma tarefa rejeitada retorna a `TODO` para replanejamento, preservando sua identidade e seu histórico no exemplo.

As regras detalhadas estão nos conceitos [07](07-responsabilidades-no-scrum.md), [08](08-fundamentos-objetivos-e-artefatos.md), [09](09-sprint-e-eventos.md) e [11](11-estados-e-regras-do-kanban.md).

## Conhecimento e execução

Os documentos poderão apoiar um RAG futuro. A identidade dos profissionais, o acervo de conhecimento e os registros de execução têm finalidades distintas.

A base não incorpora um script obrigatório de despacho de agentes, um motor de workflow ou dependências de fornecedores. A integração operacional deverá respeitar as responsabilidades documentadas, conforme o [conceito 13](13-direcao-futura-e-acoplamento.md).

## Organização desta entrega

Esta etapa entrega um `README.md` principal e 14 documentos individuais em `docs/conceitos/`. `README.md` e `docs/` organizam a explicação do projeto; não são entidades adicionais do domínio.

Os diretórios `profissoes/`, `profissionais/`, `equipes/` e `stacks/` constituem a arquitetura de referência para o conteúdo de domínio a ser materializado posteriormente. Esta publicação não afirma que todos os perfis, stacks e arquivos dessa arquitetura já estejam preenchidos.

O [conceito 12](12-cenario-e-recursos-do-prototipo.md) registra o cenário e os recursos demonstrados pelo protótipo local, distinguindo-os da implementação futura da camada.
