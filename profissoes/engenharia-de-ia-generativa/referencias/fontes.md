# Referências de Engenharia de IA Generativa

[Descrição da profissão](../descricao.md)

Fontes primárias consultadas em 14 de outubro de 2026. Os conceitos mantêm independência de fornecedor e os exemplos descrevem escolhas possíveis, sem impor serviço, modelo ou treinamento.

| Fonte | Contribuição e limite |
| --- | --- |
| [OpenAI — Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering) | Instruções, exemplos e contexto; orientações variam conforme o modelo e exigem avaliação. |
| [Lewis et al. — RAG, NeurIPS 2020, revisão arXiv v4](https://arxiv.org/abs/2005.11401v4) | Recuperação neural e geração em tarefas de conhecimento; os resultados do artigo não garantem respostas corretas em outro sistema. |
| [SQLite — FTS5](https://www.sqlite.org/fts5.html) | Busca lexical, tokenização e BM25; não implementa geração nem determina a relevância de negócio. |
| [OpenAI — Model optimization](https://developers.openai.com/api/docs/guides/model-optimization) | Avaliação, prompts e adaptação por feedback; ajuste é uma opção dependente do caso. |
| [OpenAI — Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) | Casos e critérios para qualidade generativa; exemplos numéricos do guia não são metas universais. |
| [OpenAI — Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety) | Conteúdo externo, ferramentas e mitigação de injeção; as técnicas não eliminam todos os riscos. |
| [OpenAI — Your data](https://developers.openai.com/api/docs/guides/your-data) | Tratamento e retenção variam entre recursos e configurações; conferir condições do serviço antes do uso. |
| [NIST — AI 600-1, perfil de IA Generativa, 2024](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | Riscos e ações de gestão para sistemas generativos; complementa o AI RMF 1.0, sem atestar conformidade. |

## Alcance e manutenção

As páginas de avaliação, otimização e segurança da OpenAI consultadas sinalizam interfaces em transição para documentação legada, incluindo Evals e Agent Builder. Esta profissão usa seus princípios e não prescreve essas interfaces. Versões, modalidades, serviços e condições de dados precisam de nova verificação na implementação.

Os [pilares](../pilares/praticas.md), [ciclos](../ciclos/evolucao.md) e [artefatos](../artefatos/registros.md) contêm a explicação essencial. Para formulação e dados, consulte o recorte complementar de [IA Aplicada](../../engenharia-de-ia-aplicada/referencias/fontes.md).
