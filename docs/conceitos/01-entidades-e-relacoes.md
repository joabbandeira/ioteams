# 01 — Entidades e relações

[Visão geral do projeto](../../README.md)

## Projeto ioteams

O ioteams organiza um modelo de atuação profissional que poderá ser acoplado a workflows de agentes autônomos. O domínio começa pelas definições de conhecimento e colaboração; sua integração operacional será desenvolvida posteriormente.

## Profissões

Profissão é uma entidade associada ao profissional. Ela descreve um campo de atuação e reúne os fundamentos, práticas, ciclos, artefatos e referências que sustentam esse trabalho. A profissão pode existir no catálogo independentemente da formação de uma equipe.

## Profissionais

Profissional é a entidade que representa quem atua. Possui identidade, repertório, responsabilidades e limites documentados. No uso futuro com agentes, cada profissional será representado por um agente, mantendo essa definição separada da sessão em que trabalha.

## Stacks

Stacks representam habilidades utilizadas na atuação profissional, incluindo conhecimentos, técnicas e ferramentas. Sua definição é compartilhável; o repertório efetivamente atribuído a um profissional aparece em seu documento de conhecimentos.

## Equipes

Equipe representa a composição de profissionais para uma demanda. A combinação de especialidades e stacks deve responder ao contexto do trabalho e ao objetivo que se pretende alcançar.

## Associações

| Relação | Significado |
| --- | --- |
| Profissional e Profissão | Explicita o campo de atuação que fundamenta o perfil. |
| Profissional e Stacks | Explicita as competências que o profissional aplica. |
| Profissional e Equipe | Explicita sua participação em uma composição de trabalho. |
| Equipe e demanda | Relaciona a composição ao contexto e ao objetivo da atuação. |

A profissão e as stacks sustentam o repertório; a associação à equipe define o contexto de colaboração. A identidade do profissional permanece independente de um vínculo permanente com uma equipe.

A cardinalidade entre profissional e profissões, assim como regras de participação simultânea em diferentes demandas, não foi especificada. Esta documentação exige associações explícitas, sem presumir esses comportamentos de execução.

## Profissão, especialidade e responsabilidade Scrum

Profissão descreve um campo de atuação. Especialidade identifica um recorte desse trabalho, como desenvolvimento iOS ou qualidade. Responsabilidade Scrum identifica a atuação de Product Owner, Scrum Master ou Developer na equipe.

Um profissional de desenvolvimento iOS pode atuar como Developer. Um profissional de QA também pode exercer essa responsabilidade. Product Owner e Scrum Master continuam sendo profissionais, com responsabilidades distintas das de Developers.

## Developers no modelo

Developers correspondem aos profissionais comprometidos com a produção do incremento. A denominação abrange as especialidades necessárias ao trabalho, incluindo análise, design, desenvolvimento, testes, dados e infraestrutura conforme a demanda.

O catálogo `profissionais/` pode reunir representantes das três responsabilidades Scrum. Por isso, a relação entre profissionais executores e Developers deve ser interpretada no contexto da equipe, preservando a distinção de Product Owner e Scrum Master.

## Regras de coerência

- Conhecimento de uma profissão não implica execução automática de uma tarefa.
- A presença de uma stack no catálogo não atribui domínio a todos os profissionais.
- Participar de uma equipe não redefine a identidade permanente do profissional.
- Especialidade técnica e responsabilidade Scrum devem permanecer identificáveis.

As estruturas documentais correspondentes estão no [documento 14](14-plano-documental-e-decisoes-iniciais.md). As responsabilidades são detalhadas no [documento 07](07-responsabilidades-no-scrum.md).
