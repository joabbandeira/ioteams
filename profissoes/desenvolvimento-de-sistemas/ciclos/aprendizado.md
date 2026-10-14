# Ciclos de aprendizado e evolução

[Descrição da profissão](../descricao.md)

Descoberta, construção e evolução são atividades recorrentes. Sua organização responde à incerteza e ao risco do produto; não exige concluir todo o conhecimento antes de produzir a primeira parte utilizável. O [planejamento da WAI](https://www.w3.org/WAI/planning/) reforça a integração da acessibilidade ao trabalho, e a [integração contínua descrita por Martin Fowler](https://martinfowler.com/articles/continuousIntegration.html) relaciona integração frequente a feedback automatizado.

## Descoberta

Formule uma necessidade e as suposições que a sustentam. Procure evidências com pessoas e cenários pertinentes. Uma equipe que não encontra competências pode ter problemas de vocabulário, de navegação ou de cobertura do catálogo. Construir filtros imediatamente não distingue essas causas.

Um experimento pequeno pode comparar termos em um protótipo e observar como as pessoas procuram. Registre a pergunta, quem participou, o contexto, o resultado e o que permanece incerto. O objetivo é decidir o próximo passo com informação melhor, sem tratar uma amostra pequena como comprovação universal. A WAI explica por que [envolver usuários na avaliação](https://www.w3.org/WAI/test-evaluate/involving-users/) complementa critérios técnicos.

## Construção iterativa

Escolha uma parte que atravesse as camadas necessárias para produzir um resultado verificável. Na busca, isso pode incluir um campo acessível, uma consulta real e um estado vazio compreensível. Integre cedo para descobrir incompatibilidades enquanto a mudança ainda é pequena.

Critérios de aceitação orientam os exemplos; testes de regras e contratos ajudam a localizar falhas; jornadas verificam o encontro das partes. Use dados de teste controlados e mantenha execuções independentes. As [práticas de testes do Playwright](https://playwright.dev/docs/best-practices) sustentam a avaliação do comportamento pelo usuário. Uma verificação que apenas repete a implementação pode permanecer verde quando o comportamento está errado.

## Evolução e manutenção

Após a entrega, compare o uso observado ao resultado esperado. Um termo que retorna resultados tecnicamente corretos pode continuar incompreensível. Reavalie conteúdo e experiência, além de corrigir defeitos. Mudanças de contratos e persistência precisam considerar consumidores existentes e dados já produzidos.

Para corrigir uma regressão, preserve um cenário que reproduza a falha, identifique a causa e valide a correção. Para alterar o formato dos dados, ensaie a migração em cópias ou fixtures pertencentes ao teste e verifique recuperação; não experimente em dados pessoais ou operacionais ativos. A decisão de interromper uma mudança deve ser sustentada por evidência do risco e do estado atual.

## Relação com Scrum e registros

Os ciclos podem ocorrer dentro de uma Sprint e entre Sprints. Não acrescentam eventos formais ao [Scrum](../../metodologia-agil-scrum/descricao.md). O feedback do produto pode mudar a ordem do backlog; o aprendizado sobre colaboração pode gerar melhoria na retrospectiva. Registre decisões e evidências nos [artefatos de rastreabilidade](../artefatos/rastreabilidade.md), com detalhe suficiente para compreender a escolha sem copiar logs completos ou dados sensíveis.
