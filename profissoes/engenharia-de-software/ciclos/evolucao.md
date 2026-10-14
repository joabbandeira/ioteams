# Ciclos de construção e evolução de software

[Descrição da profissão](../descricao.md)

Os ciclos organizam perguntas e feedback, com retornos e sobreposição. Uma descoberta pode invalidar um modelo; um incidente pode revelar uma premissa arquitetural incorreta. A organização não impõe uma passagem sequencial entre departamentos. Pessoas de produto, desenvolvimento, qualidade, segurança e operação colaboram conforme o problema.

## Formulação e decisão

Esclareça objetivo, restrições, regras e qualidades esperadas. Represente as fronteiras e hipóteses; compare alternativas com exemplos observáveis. A abordagem de [atributos de qualidade do SEI](https://www.sei.cmu.edu/library/quality-attribute-workshop-collection/) ajuda a revelar expectativas conflitantes. Experimentos pequenos podem reduzir uma incerteza antes de comprometer a arquitetura.

Na busca, investigue se o volume e o padrão de atualização justificam um processo separado para o índice. Registre por que uma alternativa foi escolhida e quais evidências exigiriam revisá-la. A [decisão arquitetural](../artefatos/registros.md#decisões-arquiteturais) preserva essas premissas, sem transformar um experimento em componente definitivo por acidente.

## Construção, verificação e revisão

Defina o comportamento esperado de uma parcela pequena e os casos que revelariam falhas relevantes. Construa, execute verificações e revise a solução contra a necessidade. Quando um teste falha, reproduza e investigue a causa antes de alterar código ou expectativa. Um caso de regressão deve distinguir a falha de um comportamento válido.

A experiência de [testes do SQLite](https://www.sqlite.org/testing.html) mostra a utilidade de verificar falhas além da execução normal. No exemplo, exercite uma publicação interrompida e confirme que consultas recebem uma versão coerente. Guarde as [evidências da revisão verificada](../artefatos/registros.md#estratégia-e-evidências-de-verificação) e encaminhe a parcela ao [ciclo de entrega de DevOps](../../devops/ciclos/evolucao.md#da-mudança-ao-resultado-observado).

## Compatibilidade e evolução

Avalie o impacto em consumidores e dados existentes. Planeje migração, transição e critérios para retirar compatibilidade antiga. Um contrato HTTP documentado em [OpenAPI](https://spec.openapis.org/oas/v3.1.1.html) ajuda a explicitar a fronteira, mas a compatibilidade do comportamento precisa de verificação própria.

No exemplo, acrescentar um filtro deve preservar a semântica das consultas anteriores ou comunicar uma mudança de versão. Observe resultados e reveja o modelo quando o domínio mudar. Evite corrigir cada novo caso com exceções que contradizem as regras existentes; retorne às [invariantes de corretude](../pilares/praticas.md#corretude).

## Segurança e aprendizado contínuos

Revise ameaças quando mudam entradas, integrações ou privilégios. Relacione relatos de vulnerabilidades e incidentes a hipóteses, controles e testes. O [OWASP ASVS](https://owasp.org/projects/asvs) ajuda a escolher requisitos verificáveis; não substitui análise específica do domínio ou comprova segurança só por ser citado.

Um erro de autorização na busca pode exigir alterar contrato, implementação e diagnóstico. Ligue as ações à evidência da falha e confira o resultado. O [aprendizado operacional em DevOps](../../devops/ciclos/evolucao.md#do-incidente-à-prevenção) fornece impacto e cronologia; este ciclo transforma as descobertas em decisões técnicas, correções e novas verificações.
