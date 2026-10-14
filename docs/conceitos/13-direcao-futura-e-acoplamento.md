# 13 — Direção futura e acoplamento

[Visão geral do projeto](../../README.md)

A direção do ioteams é tornar-se uma camada modular que um workflow de agentes autônomos possa incluir conforme a necessidade. O workflow deve continuar existindo sem ela; ao adotá-la, passa a contar com uma organização de conhecimentos, profissionais, equipes e coordenação por Scrum.

## Acoplamento opcional

A camada oferece um modelo de atuação, não o workflow completo. Seu uso deve ser uma escolha do sistema que a incorpora, e sua substituição ou retirada não deve exigir que toda a execução externa seja redefinida em torno dela.

Essa independência é um objetivo de arquitetura. Ainda não há uma interface técnica implementada que comprove portabilidade entre diferentes motores de execução.

## Um profissional, um futuro agente

Cada profissional será representado por um agente. Seu perfil, conhecimentos, postura de colaboração e limites de autoridade poderão orientar essa representação.

A identidade do profissional permanece separada de uma sessão específica, de uma conversa ou de uma equipe permanente. Sua participação em equipes depende da demanda; a execução concreta dependerá do workflow que hospedar os agentes.

Documentar um profissional não cria um agente executável. A implementação futura precisará estabelecer como seus documentos influenciam o comportamento e como o sistema mantém os limites definidos.

## Conhecimento e possível RAG

Profissões, stacks e documentação de equipes poderão formar parte de um acervo consultável. A documentação dos profissionais acrescenta o contexto de quem atua e com quais capacidades.

Um RAG combina recuperação de informações com geração apoiada nesse material. Portanto, os arquivos Markdown constituem uma possível base de conhecimento, mas não são, isoladamente, um RAG implementado. Essa distinção se apoia na proposta de [Retrieval-Augmented Generation, de Lewis et al.](https://arxiv.org/abs/2005.11401).

Dentro da ideia discutida, a recuperação poderá ajudar a localizar:

- Conceitos e práticas da profissão relevante à demanda.
- Stacks adequadas e suas limitações.
- Capacidades e responsabilidades dos profissionais.
- Composição e interfaces da equipe envolvida.

O estado operacional de tarefas, execuções e impedimentos tem finalidade diferente do conhecimento de referência. A futura integração precisará manter essa distinção e fornecer o contexto atual de trabalho, sem depender apenas de documentos estáticos.

## Scrum como coordenação inicial

Scrum fornece a organização inicial da atuação: direção de produto, objetivo da Sprint, plano, inspeção, adaptação e melhoria contínua.

A coordenação é distribuída entre as três responsabilidades. Product Owner orienta valor e backlog; Scrum Master apoia o estabelecimento de Scrum e a efetividade; Developers planejam e executam o trabalho de entrega. A camada não reduz toda a orquestração a um Scrum Master que comanda os demais agentes.

Eventos e artefatos oferecem pontos de organização. Como serão representados em execução autônoma, mensagens ou estados de sistema é uma questão de implementação futura, sem mecanismo fixado nesta base.

## Relação com o workflow hospedeiro

| ioteams oferece conceitualmente | O workflow hospedeiro precisará prover ou integrar |
| --- | --- |
| Vocabulário de profissões e stacks. | Acesso ao conhecimento necessário durante a execução. |
| Perfis, responsabilidades e limites dos profissionais. | Execução dos agentes e aplicação efetiva dos limites e permissões. |
| Composição e interfaces de equipes. | Meios concretos de colaboração e troca de contexto. |
| Organização por objetivos, Sprint e eventos. | Agendamento e mecanismos operacionais compatíveis com a execução. |
| Convenções de acompanhamento de tarefas. | Armazenamento e atualização confiável do estado de trabalho. |
| Condições documentadas de qualidade. | Evidências e verificações reais sobre o resultado produzido. |

A tabela delimita responsabilidades conceituais; não especifica uma API, protocolo de mensagens ou dependência de infraestrutura.

## Dinâmica possível de integração

1. O workflow apresenta uma demanda com contexto e objetivo.
2. A camada ajuda a identificar conhecimentos, profissionais e composição adequados.
3. A equipe organiza o trabalho por objetivos, backlog e Sprint.
4. O workflow executa os agentes e disponibiliza o estado e as evidências do trabalho.
5. A equipe inspeciona resultados, trata impedimentos e adapta o plano.
6. O workflow recebe os resultados e pode continuar suas próprias etapas, usando ou dispensando a camada em outras demandas.

Essa sequência expressa a intenção de funcionamento. Não presume automação já disponível para seleção de equipes, tomada de decisões, agendamento ou execução.

## Limites atuais

Não estão definidos nesta base um motor de workflow, fornecedor de modelos, banco vetorial, protocolo de integração, formato obrigatório de mensagens ou mecanismo de permissões. Também não há um orquestrador executável obrigatório incorporado aos perfis.

A documentação e o exemplo visual permitem amadurecer o modelo antes dessas escolhas. As decisões iniciais estão reunidas no [conceito 14](14-plano-documental-e-decisoes-iniciais.md).
