# 10 — Organização visual do trabalho

[Visão geral do projeto](../../README.md)

O painel usa três colunas para relacionar pessoas, cadência e entrega. A finalidade é permitir que se compreenda quem atua, como a equipe inspeciona o trabalho e em direção a qual resultado está avançando.

## Primeira coluna: equipe e profissionais

Apresenta a equipe LISA, seus integrantes e a distinção entre Product Owner, Scrum Master e Developers. As especialidades técnicas aparecem dentro de Developers, incluindo desenvolvimento iOS, qualidade e testes, banco de dados e infraestrutura.

Essa coluna permite consultar o papel de cada integrante e usar a pessoa como ponto de entrada para localizar seu trabalho no quadro. A associação individual de tarefas deve coexistir com a responsabilidade coletiva dos Developers pela entrega.

As stacks e a profissão explicam capacidades; a responsabilidade Scrum explica a participação na equipe. Esses dados não devem ser apresentados como conceitos intercambiáveis.

## Segunda coluna: cadência e eventos

Apresenta a Sprint e seus eventos: Sprint Planning, Daily Scrum, Sprint Review e Sprint Retrospective. Para cada evento, a interface pode tornar consultáveis sua finalidade, sua participação e o momento em que ocorre.

O objetivo é conectar a cadência ao trabalho: planejar a Sprint, inspecionar seu progresso, examinar o resultado e melhorar a colaboração. A coluna não converte os eventos em simples estados de aprovação das tarefas.

O [conceito 09](09-sprint-e-eventos.md) explica o que pertence ao framework e o que é uma prática complementar.

## Terceira coluna: direção e entrega

Reúne:

- **Product Goal:** direção do produto.
- **Sprint ativa:** janela atual de trabalho.
- **Sprint Goal:** resultado que dá unidade ao trabalho da Sprint.
- **Etapas:** agrupamentos usados para organizar as tarefas do exemplo.
- **Quadro Kanban:** distribuição das tarefas conforme os estados definidos para o painel.

A leitura deve permitir relacionar cada tarefa ao contexto maior, sem reduzir o objetivo do produto ao número de cartões concluídos.

## Etapas e tarefas

Uma Sprint pode conter tarefas associadas a diferentes etapas. No cenário fictício, os agrupamentos são Fundação, Agenda e lembretes, e Qualidade e entrega.

Esses agrupamentos ajudam a navegar pelo trabalho. Não estabelecem uma sequência universal em que uma especialidade precisa terminar tudo antes de outra começar, nem constituem eventos ou artefatos adicionais do Scrum.

As tarefas exibem informações úteis à execução e à inspeção: identificação, título, responsável, etapa, estado e informações de acompanhamento. Motivos de bloqueio ou rejeição e verificações de conclusão aparecem conforme a situação da tarefa.

## Leitura e interação

Busca e filtros ajudam a encontrar tarefas por assunto, profissional ou etapa. Detalhes dos integrantes e eventos ajudam a interpretar o painel sem exigir que todo o conteúdo esteja simultaneamente visível.

Indicadores e pontos apoiam a leitura do conjunto. Não devem ser apresentados como prova isolada de valor entregue, capacidade individual ou qualidade do incremento.

## Regras visuais e limites

- Manter as três responsabilidades Scrum identificáveis.
- Preservar a relação entre Product Goal, Sprint ativa, Sprint Goal e tarefas.
- Usar texto e estados compreensíveis, sem depender somente de cores.
- Permitir navegação compatível com telas menores e teclado.
- Oferecer temas claro e escuro.
- Tratar os controles como demonstração de uma dinâmica enquanto não houver integração operacional.

O protótipo local demonstra a organização e as interações. A exibição de papéis não implementa, por si só, autorização de acesso ou execução autônoma. Os recursos demonstrados estão no [conceito 12](12-cenario-e-recursos-do-prototipo.md).
