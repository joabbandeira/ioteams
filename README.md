# ioteams — Camada acoplável para workflows de agentes autônomos

O ioteams é a concepção de uma camada modular de conhecimento, composição profissional e organização do trabalho que poderá ser incluída em um workflow de agentes autônomos. Seu modelo reúne **profissões, stacks, profissionais e equipes**, com coordenação do trabalho baseada em Scrum.

O acoplamento é opcional para o workflow hospedeiro. Ele deverá continuar capaz de operar sem o ioteams e de substituir essa camada. Quando uma equipe atuar pelo modelo ioteams, a aplicação do Scrum faz parte das suas regras de organização.

**Estado do projeto:** concepção documentada e protótipo exploratório local com dados fictícios. A execução de agentes, a recuperação de conhecimento por RAG e a integração com um workflow são desenvolvimentos futuros. Esta entrega do repositório reúne a documentação conceitual.

## Qual problema resolve

A proposta trata da dificuldade de organizar atuação especializada sem misturar conhecimento, identidade profissional, responsabilidade na equipe e andamento da execução. Esses elementos precisam estar relacionados, mas possuem funções diferentes.

Um workflow que utilize a camada poderá consultar quais competências uma demanda exige, quais profissionais as representam, como eles colaboram e como o trabalho será inspecionado. A intenção é evitar que essas definições precisem ser reconstruídas dentro de cada fluxo de execução.

O problema também envolve clareza de responsabilidades: Product Owner, Scrum Master e Developers pertencem à equipe, mas respondem por aspectos distintos do trabalho. A especialidade técnica de um profissional não substitui essa distinção.

## Como funcionaria

O modelo organiza quatro entidades relacionadas:

| Entidade | Função na proposta |
| --- | --- |
| Profissões | Descrever campos de atuação, fundamentos, práticas, ciclos e artefatos. |
| Stacks | Documentar conhecimentos, técnicas e ferramentas aplicáveis ao trabalho. |
| Profissionais | Representar identidades, repertórios, responsabilidades e limites de atuação. |
| Equipes | Compor profissionais e competências conforme uma demanda. |

No uso futuro com agentes, cada profissional será representado por um agente. Profissões, stacks e definições de equipes poderão alimentar uma base de conhecimento consultável. O RAG dependerá de uma integração que recupere conteúdo relevante e o utilize na geração; a presença de arquivos Markdown, por si só, constitui a base documental.

O Scrum fornece a organização inicial da atuação: o Product Owner orienta valor e prioridades, o Scrum Master favorece a eficácia e a aplicação do framework, e os Developers planejam e produzem o incremento. A coordenação respeita essas responsabilidades e a autogestão da equipe.

## Vantagens pretendidas

- **Reutilização de conhecimento:** uma definição de profissão ou stack pode apoiar diferentes profissionais e demandas.
- **Clareza de atuação:** profissão, especialidade e responsabilidade Scrum ficam explicitadas.
- **Composição contextual:** as competências da equipe acompanham o trabalho necessário.
- **Independência do workflow:** a organização do domínio pode evoluir sem determinar um motor de execução específico.
- **Rastreabilidade:** objetivos, tarefas, impedimentos, reprovações e critérios de qualidade tornam-se relacionáveis.
- **Aprendizado contínuo:** inspeção dos resultados e retrospectivas alimentam ajustes no trabalho.

São benefícios esperados do desenho. Ganhos de produtividade, custo ou qualidade precisarão ser avaliados quando houver uma integração operacional; o protótipo não constitui uma medição desses resultados.

## Dinâmica de ponta a ponta

1. **Contextualizar a demanda.** Entender o problema, o valor esperado, as restrições e o contexto do produto.
2. **Consultar o conhecimento.** Identificar profissões, práticas e stacks pertinentes. A forma de recuperação será definida na integração futura.
3. **Compor a equipe.** Reunir Product Owner, Scrum Master e Developers com as competências necessárias. O modelo discutido utiliza uma equipe Scrum integrada.
4. **Organizar direção e prioridades.** Relacionar a demanda ao Product Goal e ao Product Backlog, sob responsabilidade do Product Owner.
5. **Planejar a Sprint.** Na Sprint Planning, a equipe define o Sprint Goal e os Developers constroem o plano de trabalho no Sprint Backlog.
6. **Executar e adaptar.** Os Developers realizam o trabalho e inspecionam seu progresso na Daily Scrum. Etapas e tarefas ajudam a visualizar o pacote de trabalho.
7. **Tratar dificuldades e qualidade.** Registrar impedimentos e motivos de reprovação. No fluxo do exemplo, a mesma tarefa reprovada retorna ao planejamento com identificador e histórico preservados.
8. **Produzir uma entrega utilizável.** Verificar os critérios de qualidade e integrar o trabalho ao incremento. A convenção `DONE` do exemplo exige critérios de pronto atendidos.
9. **Inspecionar o resultado.** Na Sprint Review, equipe e stakeholders discutem resultados e adaptações. Entregas prontas podem ser disponibilizadas antes desse evento.
10. **Melhorar a atuação.** Na Sprint Retrospective, a equipe identifica melhorias e incorpora os aprendizados ao próximo ciclo.

Esses passos descrevem a dinâmica conceitual. O trabalho dentro da Sprint permanece adaptável; as etapas do projeto não estabelecem uma sequência universal e rígida de desenvolvimento.

## Acoplamento e limites

O workflow hospedeiro mantém seus mecanismos de execução, ferramentas, estado operacional e controle de acesso. A camada oferece a organização do conhecimento e da atuação. A integração futura deverá estabelecer como uma demanda entra, como os profissionais são acionados e como resultados e evidências retornam.

Essa separação é o critério de desacoplamento: remover ou substituir o ioteams deve preservar a capacidade do workflow de continuar operando. Não há, nesta concepção inicial, escolha de motor de agentes, provedor de modelos, banco vetorial, API ou formato de mensagens.

O protótipo do time LISA permite discutir essa organização visualmente. Seus estados Kanban, estimativas e controles são convenções exploratórias, detalhadas nos documentos 10 a 12; não definem integralmente uma implementação futura.

## Documentos conceituais

| Nº | Documento |
| --- | --- |
| 01 | [Entidades e relações](docs/conceitos/01-entidades-e-relacoes.md) |
| 02 | [Profissões](docs/conceitos/02-profissoes.md) |
| 03 | [Organização das profissões](docs/conceitos/03-organizacao-das-profissoes.md) |
| 04 | [Stacks](docs/conceitos/04-stacks.md) |
| 05 | [Documentação dos profissionais](docs/conceitos/05-documentacao-dos-profissionais.md) |
| 06 | [Equipes e regras de composição](docs/conceitos/06-equipes-e-composicao.md) |
| 07 | [Responsabilidades no Scrum](docs/conceitos/07-responsabilidades-no-scrum.md) |
| 08 | [Fundamentos, objetivos e artefatos Scrum](docs/conceitos/08-fundamentos-objetivos-e-artefatos.md) |
| 09 | [Sprint e eventos](docs/conceitos/09-sprint-e-eventos.md) |
| 10 | [Organização visual do trabalho](docs/conceitos/10-organizacao-visual-do-trabalho.md) |
| 11 | [Estados e regras do Kanban](docs/conceitos/11-estados-e-regras-do-kanban.md) |
| 12 | [Cenário e recursos do protótipo](docs/conceitos/12-cenario-e-recursos-do-prototipo.md) |
| 13 | [Direção futura e acoplamento](docs/conceitos/13-direcao-futura-e-acoplamento.md) |
| 14 | [Plano documental e decisões iniciais](docs/conceitos/14-plano-documental-e-decisoes-iniciais.md) |

## Referências conceituais

As regras do framework têm como referência o [Scrum Guide 2020](https://scrumguides.org/scrum-guide.html). A distinção entre base documental e recuperação para geração utiliza o [trabalho original sobre RAG](https://arxiv.org/abs/2005.11401). As convenções de composição, documentação e visualização descritas nesta coleção pertencem à concepção do ioteams.
