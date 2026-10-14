# 11 — Estados e regras do Kanban

[Visão geral do projeto](../../README.md)

O quadro representa o acompanhamento das tarefas da Sprint. Seus estados e transições são convenções do ioteams demonstradas no protótipo; não são uma sequência prescrita pelo Scrum.

## Estados

| Estado | Significado no modelo |
| --- | --- |
| `TODO` | Tarefa a planejar ou replanejar. |
| `IN PLANNING` | Tarefa em planejamento e esclarecimento. |
| `READY` | Tarefa planejada e pronta para desenvolvimento. |
| `BLOCKED` | Tarefa pronta para desenvolvimento, mas impedida de avançar. |
| `IN PROGRESS` | Trabalho de execução em andamento. |
| `REJECTED` | Tentativa de entrega rejeitada por uma falha identificada. |
| `DONE` | Tarefa concluída e entregue no recorte do exemplo, com as verificações requeridas. |

`TODO` pertence ao contexto do quadro da Sprint; não representa todo o Product Backlog. O estado `IN PLANNING` também não equivale ao evento Sprint Planning.

## Transições do protótipo

| Origem | Destinos permitidos |
| --- | --- |
| Nova tarefa | `TODO` |
| `TODO` | `IN PLANNING` |
| `IN PLANNING` | `READY` ou `TODO` |
| `READY` | `IN PROGRESS` ou `BLOCKED` |
| `BLOCKED` | `READY`, representando a liberação do impedimento. |
| `IN PROGRESS` | `DONE` ou `REJECTED` |
| `REJECTED` | `TODO`, para replanejamento. |
| `DONE` | Sem avanço adicional no fluxo normal. |

Esse fluxo descreve o comportamento demonstrado, sem presumir que resolve todas as situações de um sistema operacional futuro. Em particular, o protótipo representa o bloqueio da tarefa pronta; uma política mais ampla de impedimentos durante a execução não foi definida como decisão inicial.

## Planejamento e início de execução

Uma tarefa nova entra em `TODO`. Em `IN PLANNING`, a equipe esclarece o trabalho necessário. Ao chegar a `READY`, a tarefa está preparada para começar, e um Developer pode assumir sua execução em `IN PROGRESS`.

O detalhamento de tarefas contribui para o Sprint Backlog. Mudanças no plano precisam continuar coerentes com o Sprint Goal e com as responsabilidades da equipe.

## Bloqueio e resolução

A passagem de `READY` para `BLOCKED` exige registrar o motivo do impedimento. A saída de `BLOCKED` devolve a tarefa para `READY`, representando sua liberação para execução.

O protótipo preserva o motivo registrado e acrescenta a transição ao histórico. Não exige um registro separado de resolução nem verifica automaticamente se a dependência foi resolvida.

Tornar o impedimento visível ajuda a equipe e o Scrum Master a atuar sobre ele. A existência do estado não transfere automaticamente a execução da solução ao Scrum Master.

## Rejeição e replanejamento

A passagem de `IN PROGRESS` para `REJECTED` exige uma justificativa. Depois, a mesma tarefa retorna a `TODO` para replanejamento.

No protótipo, o retorno preserva a identificação, o histórico e o motivo da rejeição, reiniciando as verificações de conclusão. Assim, a tentativa anterior continua compreensível e o problema pode orientar o novo plano.

Rejeição descreve uma condição do trabalho, sem estabelecer uma avaliação automática de desempenho do profissional responsável.

## Conclusão e qualidade

Para passar a `DONE`, o exemplo exige confirmar:

1. Critérios de aceitação atendidos.
2. Testes e acessibilidade verificados.
3. Resultado integrado, utilizável e pronto para entrega.

Essas verificações tornam a discussão de qualidade concreta, mas são marcações de uma simulação. O protótipo não executa testes, valida acessibilidade ou inspeciona integrações automaticamente.

Critérios de aceitação são específicos do trabalho. A Definition of Done fornece as condições compartilhadas de qualidade do incremento. Uma tarefa marcada como concluída não basta para afirmar que todo o incremento atende a essas condições, conforme o [conceito 08](08-fundamentos-objetivos-e-artefatos.md).

## Histórico, desfazer e reiniciar

O painel mantém histórico durante a interação e permite desfazer uma ação ou reiniciar o cenário. São recursos exploratórios da demonstração; não equivalem a uma trilha de auditoria persistente ou a uma política operacional de reabertura de entregas.

Os dados ficam na sessão da página, conforme explicado no [conceito 12](12-cenario-e-recursos-do-prototipo.md).
