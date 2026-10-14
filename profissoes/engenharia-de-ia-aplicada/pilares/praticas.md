# Pilares e práticas de Engenharia de IA Aplicada

[Descrição da profissão](../descricao.md)

Os pilares organizam perguntas recorrentes; não prescrevem uma sequência universal. O exemplo de triagem de suporte é fictício. Suas decisões ilustram a aplicação dos conceitos, sem constituir funcionalidades já implementadas no ioteams.

## Formulação do problema

Defina usuário, decisão, resultado esperado, horizonte de observação e custo de cada erro. Uma hipótese verificável poderia ser: sugerir uma fila reduz o tempo de triagem, mantendo os pedidos urgentes visíveis ao responsável. O objetivo do produto e a medida estatística precisam conversar: prever a fila histórica pode reproduzir um processo ruim.

Compare o processo atual, regras simples e uma alternativa com IA antes de aumentar a complexidade. As [Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) dão suporte ao uso de uma base simples e de infraestrutura confiável. Registre a hipótese e as condições de abandono no [enquadramento da decisão](../artefatos/registros.md#enquadramento-da-decisão).

## Dados para IA

Identifique origem, permissão de uso, período, população, significado dos rótulos, ausências e duplicatas. Na triagem, o nome da fila final só existe depois do encaminhamento; usá-lo como entrada seria vazamento de informação. Separe treino, validação e teste conforme tempo e entidades relacionadas antes de ajustar transformações. O [guia de problemas comuns do scikit-learn](https://scikit-learn.org/stable/common_pitfalls.html) explica vazamento e pré-processamento consistente.

O [registro de dados](../artefatos/registros.md#registro-de-dados) torna a origem rastreável sem publicar registros pessoais. Dados sintéticos são úteis para desenvolvimento, mas precisam de limites explícitos ao representar populações reais. Mudanças de rótulo ou de cobertura podem exigir rever a própria hipótese.

## Aprendizado preditivo e experimentação

Classificação estima categorias; regressão estima valores; agrupamento explora semelhanças sem um alvo rotulado equivalente. Escolha a formulação pelo uso pretendido. Na triagem, uma matriz de confusão ajuda a distinguir erros entre filas; um único percentual de acerto pode esconder falhas na fila urgente.

Controle as diferenças entre experimentos: versão dos dados, variáveis, transformação, algoritmo, parâmetros e ambiente. Reserve validação para escolha e teste para a estimativa final; reutilizar o teste para otimizar o modelo compromete essa estimativa, como discute o [scikit-learn](https://scikit-learn.org/stable/common_pitfalls.html). Registre inclusive resultados negativos no [diário de experimentos](../artefatos/registros.md#diário-de-experimentos).

## Linguagem e recuperação de conhecimento

Uma demanda de linguagem pode exigir classificação, extração, busca ou geração. Recuperar documentos significa selecionar material pertinente; gerar uma resposta apoiada no material é outra etapa. O trabalho de [Lewis et al. sobre RAG](https://arxiv.org/abs/2005.11401) combina recuperação e geração, com avaliação em tarefas de conhecimento; seus resultados não garantem qualidade em outro acervo.

Para localizar políticas de suporte, compare buscas com perguntas e documentos relevantes conhecidos. Observe também perguntas sem resposta no acervo. Autorização de acesso precisa preceder o envio dos trechos. O recorte de [recuperação em IA Generativa](../../engenharia-de-ia-generativa/pilares/praticas.md#recuperação-de-conhecimento) aprofunda citações, revisão do corpus e o contexto enviado ao gerador.

## Avaliação e evidências

Defina critérios antes de escolher a solução. Em classificação, precisão mede a proporção de acertos entre os casos previstos como pertencentes à classe; revocação mede a proporção dos casos reais dessa classe que foram encontrados. Compare ambas por classe, consequências de falsos positivos e negativos e desempenho por segmentos relevantes. Na triagem, errar um pedido urgente tem custo diferente de confundir duas filas comuns. Um limiar para revisão humana deve refletir esse custo e ser validado; uma pontuação do modelo não é automaticamente uma probabilidade calibrada.

Meça o pipeline completo e suas partes. Registre população, tamanho da amostra, dispersão ou incerteza apropriada, versões e falhas conhecidas no [relatório de avaliação](../artefatos/registros.md#relatório-de-avaliação). Para sistemas com geração, o guia de [avaliação da OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices) fundamenta objetivos e casos representativos; os critérios específicos de respostas estão em [IA Generativa](../../engenharia-de-ia-generativa/pilares/praticas.md#avaliação-generativa).

## Operação e confiabilidade

Verifique entradas, tempo de resposta, falhas, custo e qualidade observável após a liberação. Mudança na distribuição dos dados é um sinal a investigar; não prova, isoladamente, queda de qualidade. Quando os rótulos chegam com atraso, registre essa limitação e use sinais provisórios sem tratá-los como resultado final.

Investigue diferenças entre preparação de dados em treino e em produção; as [Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) discutem esse desvio. Na triagem, entradas inválidas ou serviço indisponível podem retornar ao encaminhamento manual. Combine critérios de interrupção e reversão no [plano operacional](../artefatos/registros.md#plano-operacional), com apoio de [DevOps](../../devops/pilares/praticas.md#confiabilidade).

## Governança e privacidade

Determine responsáveis pela decisão, usos permitidos, grupos afetados e como contestar ou corrigir resultados. O [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) organiza gestão de riscos em Govern, Map, Measure e Manage. Ele é um referencial voluntário, sem substituir obrigações aplicáveis ou avaliação do contexto.

Minimize os dados coletados e os enviados a terceiros; defina acesso, retenção e descarte também para logs e conjuntos de avaliação. Textos recebidos, documentos e resultados de modelos são dados não confiáveis: não concedem autoridade para executar ações. Se uma solução usa agentes, a [orientação de segurança da OpenAI](https://developers.openai.com/api/docs/guides/agent-builder-safety) ajuda a separar conteúdo externo de instruções privilegiadas. Os controles executáveis pertencem ao sistema hospedeiro; estão aprofundados em [governança generativa](../../engenharia-de-ia-generativa/pilares/praticas.md#governança-e-conteúdo-não-confiável).
