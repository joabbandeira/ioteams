# Artefatos de Engenharia de IA Aplicada

[Descrição da profissão](../descricao.md)

Artefatos conectam escolhas a evidências e responsáveis. Seu formato pode variar; devem permitir compreender o resultado e investigar erros. Exemplos abaixo são propostas de registro para uma triagem fictícia, sem dados pessoais reais.

## Enquadramento da decisão

Registre problema, usuários, pessoas afetadas, resultado esperado, alternativa sem IA, consequências dos erros e critérios de interrupção. Distinga a hipótese de produto da tarefa estatística. Por exemplo: reduzir espera é um objetivo; prever a fila é um meio cuja utilidade precisa ser demonstrada. As [Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) ajudam a relacionar métricas e produto.

## Registro de dados

Descreva proveniência, finalidade autorizada, período, população, definições dos rótulos, partições, transformações e limitações. Referencie versões e localização controlada; evite copiar exemplos sensíveis para documentação pública. Registre como duplicatas, entidades relacionadas e dados posteriores à decisão foram tratados. O [scikit-learn](https://scikit-learn.org/stable/common_pitfalls.html) explica o risco de vazamento que esse registro ajuda a investigar.

## Diário de experimentos

Relacione hipótese, dados, código, ambiente, configuração, base de comparação e resultados. Inclua falhas e decisões de descarte. Uma semente fixa auxilia a repetição quando suportada, mas não garante equivalência entre ambientes ou serviços. Na triagem, registre quais variáveis estavam disponíveis no momento da previsão e por que cada alternativa foi escolhida.

## Relatório de avaliação

Identifique versão avaliada, conjunto reservado, critérios, método, tamanho e cobertura da amostra, resultados por classe ou segmento e erros observados. Distinga medição executada de hipótese, teste determinístico de avaliação estatística, e resultado offline de observação em uso. Para componentes generativos, referencie também a [ficha de avaliação generativa](../../engenharia-de-ia-generativa/artefatos/registros.md#conjunto-e-relatório-de-avaliação). O guia de [avaliação da OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices) orienta ligar casos e métricas ao objetivo.

## Plano operacional

Documente dependências, versões compatíveis, limites de tempo e custo, sinais de qualidade, alertas, responsáveis, processo manual e critérios de suspensão e reversão. Na triagem, descreva o destino de entradas rejeitadas e quem inspeciona os pedidos urgentes. Relacione o plano à [operação](../pilares/praticas.md#operação-e-confiabilidade) e às práticas de [DevOps](../../devops/artefatos/registros.md).

## Registro de riscos e uso

Explique finalidade, usos inadequados, riscos por grupo afetado, controles, responsáveis e riscos remanescentes. Inclua decisões sobre coleta, acesso, retenção e descarte, com revisão quando finalidade ou dados mudarem. O [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) fundamenta a gestão contínua; preencher um registro não comprova conformidade nem ausência de dano.
