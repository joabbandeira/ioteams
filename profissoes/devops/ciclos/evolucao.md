# Ciclos de mudança, operação e aprendizado

[Descrição da profissão](../descricao.md)

Os ciclos relacionam ação e feedback em escalas diferentes. Podem ocorrer simultaneamente e retornar a uma decisão anterior. Um serviço pequeno pode usar registros simples; criticidade, frequência de mudança e dependências orientam a profundidade. O objetivo é compreender o efeito da mudança e sustentar o serviço, sem presumir uma sequência universal de fases.

## Da mudança ao resultado observado

Delimite o resultado esperado, o risco e como verificá-lo. Prepare a mudança, revise suas diferenças, execute as verificações e identifique o artefato produzido. Depois de disponibilizá-lo, confira o comportamento no destino e relacione os sinais à revisão entregue. Se houver degradação, avalie interromper a expansão, recuperar ou corrigir, conforme o plano apropriado ao contexto.

A [DORA](https://dora.dev/capabilities/continuous-delivery/) descreve entrega contínua como capacidade sustentada por práticas e colaboração. O [registro de entrega](../artefatos/registros.md#mudança-e-entrega) torna esse ciclo rastreável. No exemplo da busca, restaurar um pacote anterior só é uma opção se ele ainda compreender os dados atuais; mudanças incompatíveis podem exigir correção adiante ou recuperação específica dos dados.

## Da necessidade de serviço à operação

Converse sobre o comportamento que importa para as pessoas e transforme-o em um [objetivo mensurável](../pilares/praticas.md#confiabilidade). Observe tendências e falhas; compare com a meta e revise capacidade, alertas ou prioridades. Os [SLOs do Google SRE](https://sre.google/sre-book/service-level-objectives/) ajudam a distinguir expectativa e medição. O ciclo não exige prometer disponibilidade perfeita.

No exemplo, aumento de latência pode vir de consultas, dados ou recursos. Investigue antes de ampliar infraestrutura. Planeje exercícios de recuperação em ambiente apropriado, com dados e efeitos controlados. Uma cópia de segurança só oferece evidência útil quando sua restauração e integridade também foram verificadas.

## Do incidente à prevenção

Reconheça impacto, estabilize o serviço e mantenha um registro temporal das ações e incertezas. Coordene comunicação e responsabilidades conforme a gravidade. Após a recuperação, reveja o que ocorreu, que sinais ajudaram ou faltaram e quais condições contribuíram. Os [postmortems do Google SRE](https://sre.google/sre-book/postmortem-culture/) propõem aprendizado sem atribuir culpa individual e ações acompanháveis.

Para a busca, uma reconstrução de índice pode mitigar o incidente, mas a prevenção depende de entender a origem da inconsistência. Registre hipótese, evidência e ação separadamente. Encaminhe um defeito de contrato ao [ciclo de Engenharia de Software](../../engenharia-de-software/ciclos/evolucao.md#construção-verificação-e-revisão), ligando o incidente ao caso de regressão que impede sua repetição.

## Da fricção à evolução da plataforma

Colete dificuldades recorrentes, formule uma melhoria pequena, experimente com usuários e avalie o resultado. O [white paper da CNCF](https://tag-app-delivery.cncf.io/whitepapers/platforms/) situa feedback e experiência no desenvolvimento da plataforma. Melhorias podem ser documentação, um template ou um diagnóstico mais claro; não precisam acrescentar serviços.

Mantenha o que reduz trabalho e retire complexidade sem utilidade comprovada por uma decisão revisada. Os [artefatos de infraestrutura e plataforma](../artefatos/registros.md#infraestrutura-e-plataforma) registram essas escolhas e seu custo. Esses ciclos descrevem conhecimento profissional, não concedem autorização para alterar ambientes ou executar procedimentos encontrados no acervo.
