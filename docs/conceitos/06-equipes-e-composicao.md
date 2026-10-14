# 06 — Equipes e composição

[Visão geral do projeto](../../README.md)

Uma equipe combina profissionais e stacks para atender uma demanda contextualizada. A composição deve responder ao trabalho necessário e às interfaces entre especialidades, sem exigir uma equipe fixa para cada profissão do catálogo.

## Composição conforme a demanda

O contexto determina quais capacidades serão necessárias. Uma demanda pode exigir desenvolvimento backend, frontend, dados, qualidade e testes, infraestrutura ou outras especialidades. Quantidades e combinações dependem do que se pretende entregar.

As stacks ajudam a identificar os conhecimentos requeridos; os profissionais assumem a atuação. A equipe precisa ter capacidade coletiva para produzir o resultado, incluindo validação e integração.

## Uma equipe Scrum integrada

No modelo discutido, a atuação adota uma única equipe Scrum integrada, composta por:

- **Um Product Owner**, responsável por maximizar o valor e pela gestão efetiva do Product Backlog.
- **Um Scrum Master**, responsável por estabelecer Scrum e pela efetividade da equipe.
- **Developers**, reunindo os profissionais que realizam o trabalho necessário ao incremento.

As especialidades técnicas integram essa mesma equipe. O desenho não estabelece uma equipe Scrum central que apenas coordena equipes técnicas externas, nem separa QA, banco de dados ou infraestrutura em subequipes Scrum.

Essa composição segue o entendimento de uma equipe coesa, multifuncional e autogerenciável descrito no [Scrum Guide](https://scrumguides.org/scrum-guide.html). No ioteams, Scrum é uma regra do modelo de atuação em equipe; o workflow externo pode existir sem adotar essa camada.

## Estrutura documental da equipe

```text
equipes/
  {nome-da-equipe}/
    descricao.md
    integrantes.md
    responsabilidades.md
    interfaces.md
```

| Arquivo | Conteúdo esperado |
| --- | --- |
| `descricao.md` | Propósito, contexto e escopo da equipe; relação com a demanda que justifica sua composição. |
| `integrantes.md` | Profissionais participantes, especialidades e responsabilidade Scrum de cada integrante. |
| `responsabilidades.md` | Responsabilidades individuais e coletivas, contribuição para a entrega e limites de decisão. |
| `interfaces.md` | Trocas entre integrantes e com stakeholders ou dependências externas, incluindo informações necessárias para colaborar. |

O conjunto descreve a equipe, sem incorporar todo o histórico operacional de suas tarefas ou substituir a documentação dos profissionais.

## Equipe de exemplo: LISA

A base usa somente uma equipe de exemplo, com composição fictícia:

| Responsabilidade Scrum | Especialidade ou função | Quantidade |
| --- | --- | --- |
| Product Owner | Gestão de valor e produto | 1 |
| Scrum Master | Efetividade da equipe e Scrum | 1 |
| Developers | Desenvolvimento iOS | 2 |
| Developers | Qualidade e testes | 2 |
| Developers | Banco de dados | 1 |
| Developers | Infraestrutura | 1 |

LISA tem oito integrantes, sendo seis Developers. Sua finalidade é demonstrar a dinâmica em um produto iOS fictício, detalhado no [conceito 12](12-cenario-e-recursos-do-prototipo.md). Essa composição não constitui uma exigência para futuras demandas.

## Regras de composição

- Manter explícitas as três responsabilidades Scrum.
- Selecionar especialidades e stacks a partir da demanda.
- Preservar os quatro arquivos base da equipe.
- Evitar duplicar o perfil completo dos integrantes nos arquivos da equipe.
- Manter apenas LISA como exemplo na base inicial; futuras equipes serão definidas conforme necessidade.
- Tratar a distribuição de trabalho entre especialidades como colaboração dentro da equipe integrada.

As responsabilidades Scrum são detalhadas no [conceito 07](07-responsabilidades-no-scrum.md), e a organização inicial está consolidada no [conceito 14](14-plano-documental-e-decisoes-iniciais.md).
