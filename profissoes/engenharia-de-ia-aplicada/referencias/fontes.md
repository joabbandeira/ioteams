# Referências de Engenharia de IA Aplicada

[Descrição da profissão](../descricao.md)

Fontes primárias consultadas em 14 de outubro de 2026. As sínteses e os exemplos da profissão contextualizam essas fontes; não exigem suas ferramentas nem constituem uma certificação de adequação.

| Fonte | Contribuição e limite |
| --- | --- |
| [Google — Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) | Engenharia de ML, base simples, métricas e diferenças entre treino e produção; experiências do Google precisam ser adaptadas ao domínio. |
| [scikit-learn — Common pitfalls, documentação stable consultada](https://scikit-learn.org/stable/common_pitfalls.html) | Exemplos de vazamento e pré-processamento; não define uma estratégia universal de amostragem. |
| [Lewis et al. — RAG, NeurIPS 2020, revisão arXiv v4](https://arxiv.org/abs/2005.11401v4) | Pesquisa que combina recuperação e geração; usa recuperação neural densa e não especifica a implementação lexical local do ioteams. |
| [OpenAI — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) | Princípios de avaliações representativas para geração; não fornece limiares universais para este domínio. |
| [NIST — AI RMF 1.0, 2023](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) | Gestão voluntária de riscos no ciclo de vida; não substitui análise legal ou controles concretos. |
| [OpenAI — Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety) | Riscos de conteúdo externo e acesso a ferramentas; mitigações reduzem riscos sem eliminá-los. |

## Alcance e manutenção

As páginas OpenAI consultadas sinalizam a transição das interfaces Evals e Agent Builder. Aqui sustentam conceitos, sem recomendar integração com essas interfaces. Antes de implementar um serviço, confira documentação vigente, disponibilidade, permissões e tratamento dos dados.

Os [pilares](../pilares/praticas.md), [ciclos](../ciclos/evolucao.md) e [artefatos](../artefatos/registros.md) explicam as decisões sem depender de uma visita aos links. Para recuperação, contexto e geração, consulte também as [fontes de IA Generativa](../../engenharia-de-ia-generativa/referencias/fontes.md).
