# Artefatos e compromissos

[Descrição da profissão](../descricao.md)

Artefatos tornam trabalho e valor inspecionáveis; compromissos dão foco ao que se observa. Os três pares são Product Backlog–Product Goal, Sprint Backlog–Sprint Goal e Incremento–Definition of Done. A [base local de fundamentos e artefatos](../../../docs/conceitos/08-fundamentos-objetivos-e-artefatos.md) explica sua relação com o painel; o [Scrum Guide](https://scrumguides.org/scrum-guide.html) define os conceitos.

## Product Backlog

É o conjunto emergente e ordenado de melhorias necessárias ao produto, sob responsabilidade de gestão do Product Owner. O compromisso Product Goal descreve um estado futuro que orienta as escolhas. A equipe cumpre ou abandona esse objetivo antes de assumir outro. Refinar itens aumenta seu entendimento; os Developers que farão o trabalho respondem por dimensioná-lo. Veja [Product Backlog em Scrum.org](https://www.scrum.org/resources/what-is-a-product-backlog).

Exemplo local: um Product Goal pode ser “permitir que equipes encontrem competências adequadas com autonomia”. Itens sobre linguagem do catálogo, busca e acessibilidade contribuem de maneiras diferentes. Ordená-los exige considerar aprendizado e valor, além do tamanho de implementação.

## Sprint Backlog

Reúne o Sprint Goal, os itens selecionados e o plano para produzir o incremento. É elaborado por e para os Developers e muda à medida que aprendem. Seu compromisso Sprint Goal dá coerência ao trabalho sem congelar cada tarefa. A fonte complementar é [Sprint Backlog em Scrum.org](https://www.scrum.org/resources/what-is-a-sprint-backlog).

Para o objetivo “encontrar uma competência pelo teclado”, o plano pode conter interface, tratamento de dados e testes. Descobrir uma incompatibilidade de foco pode exigir substituir uma tarefa técnica. Os Developers colaboram com o PO para renegociar escopo preservando o objetivo. O quadro ajuda a visualizar o plano, mas não substitui a explicação de por que esse trabalho existe.

## Incremento

É uma parte utilizável do produto, integrada e verificada com o que já existe. Seu compromisso Definition of Done torna explícitas as condições compartilhadas de qualidade. Pode haver vários incrementos na Sprint e entrega antes da Review. Trabalho que não atende a essa definição não compõe o incremento concluído. Consulte [Incremento em Scrum.org](https://www.scrum.org/resources/what-is-an-increment).

Critérios de aceitação descrevem expectativas de um item: por exemplo, uma busca vazia explica como tentar novamente. A DoD descreve qualidade comum: integração preservada e verificações pertinentes aprovadas. Aprovar o caso feliz de uma tarefa não comprova o segundo conjunto. Uma DoD organizacional é um mínimo; quando várias equipes trabalham no mesmo produto, precisam compartilhar essa definição.

## Rastreabilidade no ioteams

| Registro | Pergunta que ajuda a responder | Exemplo local |
| --- | --- | --- |
| Product Goal | Qual estado futuro importa? | Encontrar competências com autonomia. |
| Sprint Goal | Que resultado conecta esta Sprint? | Buscar uma competência pelo teclado. |
| Critério de aceitação | O que observar neste item? | Resultados vazios oferecem orientação. |
| Definition of Done | Qual qualidade comum foi atingida? | Fluxo integrado e verificações aprovadas. |
| Evidência da execução | O que foi realmente verificado? | Comando, resultado e revisão testada. |

A última linha é uma prática operacional local, sem criar outro artefato Scrum. Um estado `DONE` no quadro não prova sozinho que o incremento atende à DoD. Conecte essas perguntas às [responsabilidades](../papeis/responsabilidades.md) e aos [eventos](../eventos/cadencia.md) para evitar tratar registros como substitutos da colaboração.
