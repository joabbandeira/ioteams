# Ciclos de experimentação e operação de IA Aplicada

[Descrição da profissão](../descricao.md)

Os ciclos retornam ao problema e aos dados quando as evidências mudam. Não há obrigação de treinar um modelo em cada demanda: descoberta, correção do processo ou uma busca simples podem ser resultados suficientes. As [Rules of Machine Learning do Google](https://developers.google.com/machine-learning/guides/rules-of-ml) sustentam uma evolução por evidências e feedback operacional.

## Enquadrar e verificar viabilidade

Converse com quem usa e quem é afetado pela decisão. Registre a hipótese, os riscos e como comparar com o processo atual no [enquadramento](../artefatos/registros.md#enquadramento-da-decisão). Na triagem fictícia, verifique se há exemplos representativos de urgência e se os responsáveis conseguem corrigir sugestões. Sem dados adequados ou condições de avaliação, documentar a inviabilidade evita uma automação sem base.

## Preparar e experimentar

Reveja os rótulos com especialistas, estabeleça partições e versione o preparo dos dados. Compare poucas alternativas justificadas pelo problema, registrando configurações e resultados. O [scikit-learn](https://scikit-learn.org/stable/common_pitfalls.html) mostra por que aprender transformações usando o conjunto de teste contamina a avaliação. Uma melhoria aparente precisa ser investigada antes de ser aceita.

## Avaliar e decidir a liberação

Confronte o candidato com a base de comparação nos casos reservados, incluindo entradas inválidas, casos raros e segmentos relevantes. Registre os resultados no [relatório](../artefatos/registros.md#relatório-de-avaliação). Uma sugestão de fila pode começar em observação, sem alterar encaminhamentos, para avaliar o processo completo. A decisão de uso e os limites de supervisão são explícitos; uma métrica agregada não os define sozinha.

## Observar e revisar

Acompanhe os indicadores combinados e a chegada de resultados reais. Investigue incidentes e alterações no domínio antes de atribuir o problema apenas ao modelo. Uma fila nova pode exigir atualizar regras, rótulos, dados ou a interface. Siga o [plano operacional](../artefatos/registros.md#plano-operacional) para suspender a automação, reverter ou voltar ao processo manual.

## Encerrar ou reformular

Retire componentes sem utilidade demonstrável e trate dados, versões e registros conforme sua política de retenção. Preserve evidências suficientes para explicar a decisão, com acesso restrito quando necessário. Reavalie finalidade e riscos, em linha com o [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf). O ciclo pode voltar à formulação, sem presumir que mais dados ou um modelo maior resolverão o problema.
