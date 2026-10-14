---
version: 1
kind: profession
id: engenharia-de-ia-generativa
name: Engenharia de IA Generativa
---
# Engenharia de IA Generativa

Engenharia de IA Generativa reúne práticas para construir e avaliar sistemas que produzem conteúdo com modelos generativos. Seu recorte aprofunda modelos e modalidades, contexto e prompts, recuperação de conhecimento, adaptação, avaliação, operação e governança. Qualidade depende do sistema completo, das evidências disponíveis e do uso pretendido.

## Propósito e recorte

Transforme uma necessidade em comportamento observável: qual saída é útil, quais fatos precisam de fonte, quando pedir esclarecimento e quando se abster? O guia de [otimização de modelos da OpenAI](https://developers.openai.com/api/docs/guides/model-optimization) conecta avaliações, prompts e adaptação por feedback. Essas técnicas são opções, sem obrigatoriedade de ajuste de modelo ou de fornecedor específico.

## Percurso de consulta

- [Pilares e práticas](pilares/praticas.md): modalidades, contexto, recuperação, adaptação e limites de confiança.
- [Ciclos de construção e revisão](ciclos/evolucao.md): formular, comparar, inspecionar e evoluir.
- [Artefatos generativos](artefatos/registros.md): especificação de contexto, corpus, avaliações e operação.
- [Referências e limites](referencias/fontes.md): origens e alcance dos conceitos.

## Relações no catálogo

[IA Aplicada](../engenharia-de-ia-aplicada/descricao.md) aprofunda formulação do problema, dados, experimentos e validação da solução de domínio. IA Generativa concentra os desafios de produzir conteúdo e integrar modelos a contexto, recuperação e ferramentas. [Engenharia de Software](../engenharia-de-software/descricao.md) e [DevOps](../devops/descricao.md) sustentam contratos, segurança e operação.

A profissão não define responsabilidade [Scrum](../metodologia-agil-scrum/descricao.md), equipe permanente ou poder para executar ações. A [organização do catálogo](../../docs/conceitos/03-organizacao-das-profissoes.md) preserva identidade e relações independentes da sessão de execução.

## Exemplo e limites

Em um assistente fictício de consulta a procedimentos de suporte, a resposta deve apontar trechos pertinentes e reconhecer ausência de evidência. Fluência não comprova correção. Recuperação local não impede que o contexto selecionado seja enviado a um modelo remoto; destino, acesso e privacidade dependem da implementação e da autorização do uso.
