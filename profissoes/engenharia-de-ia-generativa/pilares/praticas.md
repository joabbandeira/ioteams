# Pilares e práticas de Engenharia de IA Generativa

[Descrição da profissão](../descricao.md)

O exemplo de assistente de procedimentos é fictício e serve à explicação. As técnicas podem ser combinadas conforme evidências, sem uma escada obrigatória de prompt, RAG e ajuste de modelo.

## Modelos e modalidades

Modelos generativos podem produzir texto, código, imagens ou áudio; receber uma modalidade não implica produzir a mesma modalidade. Verifique as capacidades e restrições do candidato na documentação vigente. Na consulta de suporte, uma entrada de voz acrescentaria transcrição, ruído, acessibilidade e privacidade à avaliação, mesmo quando a resposta final fosse textual.

Compare candidatos nas mesmas tarefas, considerando qualidade, tempo, custo, limites de contexto e condições de uso. O guia de [otimização da OpenAI](https://developers.openai.com/api/docs/guides/model-optimization) destaca variação entre famílias e versões. Não fixe um modelo pelo nome da profissão; registre a versão realmente avaliada e suas limitações.

## Engenharia de contexto e prompts

Contexto reúne objetivo, instruções confiáveis, estado pertinente, exemplos e dados selecionados dentro dos limites do modelo. Prompt organiza a solicitação: saída esperada, critérios, fontes disponíveis e comportamento diante de informação insuficiente. O guia de [prompt engineering da OpenAI](https://developers.openai.com/api/docs/guides/prompt-engineering) trata instruções, exemplos e contexto relevante.

No assistente, delimite a pergunta e os trechos do procedimento separadamente das regras do produto. Priorize material pertinente e sua proveniência; inserir mais documentos pode diluir a evidência útil. Versione a [especificação de contexto](../artefatos/registros.md#especificação-de-contexto-e-prompt) e reavalie mudanças. Um pedido textual para obedecer às regras não substitui controles de acesso ou validação de efeitos.

## Recuperação de conhecimento

RAG recupera material e o utiliza na geração. A pesquisa de [Lewis et al.](https://arxiv.org/abs/2005.11401) é uma referência de recuperação neural combinada à geração; o princípio permite discutir outras escolhas de recuperação sem igualar suas propriedades. Busca lexical, vetorial e híbrida têm custos e falhas distintos. O [SQLite FTS5](https://www.sqlite.org/fts5.html) oferece busca textual e ordenação BM25; isso, isoladamente, não produz uma resposta generativa nem prova relevância semântica.

Defina raízes permitidas, documentos acessíveis, divisão em trechos, atualização do índice, filtros e ordenação. No assistente, um procedimento revogado não deve competir silenciosamente com sua substituição. Preserve caminho, seção, linhas, hash e revisão do trecho para permitir conferir a citação. Esses campos são uma escolha de rastreabilidade deste catálogo, sem atribuí-los ao artigo original.

Avalie recuperação com perguntas e documentos relevantes conhecidos, incluindo ausência de resposta e restrição de acesso. Depois avalie se a resposta é sustentada pelos trechos. Uma citação existente pode não sustentar a afirmação. Documentos recuperados permanecem conteúdo não confiável, conforme a seção de [governança](#governança-e-conteúdo-não-confiável); seu texto não concede permissões.

## Adaptação de modelos

Adaptação por treinamento altera parâmetros; contexto e recuperação alteram a informação fornecida na execução. Um erro de localização de procedimento pede investigar recuperação antes de presumir necessidade de ajuste fino. Um padrão de formato persistente pode justificar comparar exemplos no prompt e adaptação, se houver dados e condições adequados.

O guia de [otimização da OpenAI](https://developers.openai.com/api/docs/guides/model-optimization) apresenta ajuste como opção para certos casos. Separe dados de treinamento e avaliação, examine direitos e privacidade e registre o ganho frente à alternativa sem adaptação. Não trate treinamento como armazenamento confiável de fatos atualizados nem como garantia de remoção posterior de informação aprendida.

## Avaliação generativa

Avalie por tarefa e consequência: correção, sustentação nas fontes, completude, formato, abstenção apropriada, privacidade e uso de ferramentas. O guia de [avaliação da OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices) orienta casos representativos, critérios explícitos e revisão contínua. Benchmarks gerais não substituem casos do produto.

Para o assistente, reúna pergunta respondível, ambígua, sem fonte, com fontes conflitantes e com instrução maliciosa em documento. Separe recuperação insuficiente de geração incorreta mesmo com a evidência presente. Use validadores determinísticos para schema e referências, e julgamento humano para sustentação e utilidade. Se usar um modelo avaliador, calibre a rubrica com revisores humanos, registre divergências e considere vieses; sua nota não é verdade independente.

Considere repetição amostral quando a variabilidade importar, relatando condições e dispersão em vez de selecionar a melhor resposta. A [ficha de avaliação](../artefatos/registros.md#conjunto-e-relatório-de-avaliação) deve diferenciar medição realizada de exemplo e hipótese. Nenhuma nota libera automaticamente efeitos externos.

## Operação e confiabilidade

O sistema inclui preparação, recuperação, modelo, validadores, ferramentas e apresentação. Estabeleça limites de contexto, tempo, custo e chamadas, além de comportamento para indisponibilidade e saída inválida. Um timeout de ferramenta pode deixar o efeito incerto; reconcilie o estado antes de repetir uma ação. Esse requisito se relaciona aos [sistemas distribuídos](../../engenharia-de-software/pilares/praticas.md#sistemas-distribuídos).

Mantenha versões de prompt, modelo, corpus e configuração associadas aos resultados. Observe qualidade e falhas sem armazenar conteúdo pessoal desnecessário. Mudanças exigem comparação com a base e possibilidade de reversão. O [plano de operação](../artefatos/registros.md#plano-de-operação-e-mudança) liga esses controles à [confiabilidade em DevOps](../../devops/pilares/praticas.md#confiabilidade).

## Governança e conteúdo não confiável

Prompt injection ocorre quando conteúdo externo tenta alterar o comportamento por instruções embutidas. A [orientação de segurança da OpenAI](https://developers.openai.com/api/docs/guides/agent-builder-safety) recomenda separar entradas não confiáveis de mensagens privilegiadas, restringir fluxos e manter aprovações. Delimitar texto ou validar JSON ajuda, mas não torna o conteúdo confiável.

No assistente, um documento que solicita exportar dados deve ser tratado como material da consulta. Políticas executáveis e permissões pertencem ao host; aplicar menor privilégio, validar argumentos e vincular aprovações ao efeito concreto reduz a exposição. Uma resposta, citação ou resultado de ferramenta não pode conceder acesso adicional. Teste tentativas de exfiltração com dados sintéticos em ambiente isolado.

O [perfil generativo NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) aborda riscos como confabulação, privacidade e integridade da informação. Confabulação inclui afirmações erradas apresentadas de modo convincente. Registre responsáveis, usos excluídos, controles e riscos remanescentes. Na integração externa, identifique o destino de prompts, trechos, arquivos e logs; retenção depende do serviço e da configuração, como mostra a documentação [Your data da OpenAI](https://developers.openai.com/api/docs/guides/your-data). Operar o índice localmente não equivale a manter toda a geração local.
