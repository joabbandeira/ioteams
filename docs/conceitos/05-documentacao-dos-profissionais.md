# 05 — Documentação dos profissionais

[Visão geral do projeto](../../README.md)

O profissional é a identidade que reúne conhecimentos, responsabilidades e uma forma de colaborar. Sua documentação permite compor equipes conforme a demanda, sem confundir essa identidade com uma tarefa, uma sessão de execução ou uma equipe permanente.

## Estrutura de cada profissional

```text
profissionais/
  {nome-do-profissional}/
    perfil.md
    personalidade.md
    conhecimentos.md
    curriculo.md
    referencias/
```

`referencias/` é um diretório ao lado dos quatro arquivos. Cada documento tem uma finalidade própria e deve evitar repetir integralmente o conteúdo dos demais.

## Perfil

`perfil.md` apresenta a identidade funcional do profissional:

- **Identidade e profissão:** nome e associação às profissões relevantes para sua atuação.
- **Missão:** contribuição esperada no contexto de trabalho.
- **Responsabilidades:** atividades e resultados pelos quais responde.
- **Competências:** capacidades necessárias para cumprir sua missão, com referências ao catálogo de conhecimentos.
- **Entregáveis:** resultados que pode produzir ou ajudar a produzir.
- **Interfaces de colaboração:** com quem precisa trocar informações e em quais situações.
- **Limites de autoridade:** decisões que pode tomar e assuntos que dependem de outras responsabilidades ou de autorização do contexto.

A participação em uma equipe específica fica documentada na equipe. O perfil não pressupõe vínculo permanente com LISA ou com qualquer outra composição.

## Personalidade

`personalidade.md` descreve a postura de colaboração: comunicação, tratamento de dúvidas, resposta a críticas e maneira de explicar decisões. Essa orientação deve favorecer clareza e cooperação, mantendo os limites de autoridade definidos no perfil.

Para a futura representação por agentes, esse arquivo poderá orientar o comportamento. A documentação, por si só, não implementa esse comportamento nem garante sua observância.

## Conhecimentos

`conhecimentos.md` relaciona as stacks e os conhecimentos relevantes para a profissão e a missão do profissional. Deve explicar sua aplicação e apontar para as definições compartilhadas em `stacks/`, evitando cópias divergentes.

Uma stack associada ao profissional indica um conhecimento esperado. Não concede automaticamente acesso a ferramentas, ambientes ou dados.

## Currículo

`curriculo.md` resume a trajetória ou a composição de capacidades representadas pelo profissional, de forma compatível com sua natureza. Para pessoas reais, experiências e qualificações precisam ter base verificável. Para personagens ou agentes conceituais, o conteúdo deve estar identificado como fictício ou como perfil de capacidades.

Não se devem inventar experiências reais, certificados, empregadores ou resultados comprovados para tornar o perfil mais convincente.

## Referências

`referencias/` reúne fontes que sustentam os conhecimentos e práticas do profissional. Cada referência deve indicar o assunto apoiado e sua utilidade; links isolados não substituem uma explicação suficiente nos documentos principais.

## Relação com Scrum e com equipes

O catálogo pode conter profissionais que assumem Product Owner, Scrum Master ou Developers. A responsabilidade Scrum assumida em uma equipe deve ficar explícita, conforme o [conceito 07](07-responsabilidades-no-scrum.md).

Uma especialidade técnica, como QA ou infraestrutura, pode integrar Developers. Conhecimento técnico também pode existir em um Product Owner ou Scrum Master, mas isso não os torna automaticamente Developers.

Identificadores de sessões, conversas e execuções não fazem parte da identidade permanente do profissional. As decisões sobre organização documental estão reunidas no [conceito 14](14-plano-documental-e-decisoes-iniciais.md).
