# Artefatos de Engenharia de IA Generativa

[Descrição da profissão](../descricao.md)

Os registros permitem reconstruir decisões e avaliar mudanças sem depender de memória de uma conversa. Guardam referências suficientes, com acesso e retenção definidos; não exigem publicar prompts pessoais, credenciais ou transcrições completas.

## Especificação de contexto e prompt

Registre objetivo, comportamento esperado, fontes de instrução confiáveis, dados externos delimitados, exemplos, formato de saída, abstenção e limites de ferramentas. Identifique versão e critérios de revisão. O guia de [prompt engineering da OpenAI](https://developers.openai.com/api/docs/guides/prompt-engineering) oferece técnicas de instrução e contextualização. No assistente fictício, explique como uma fonte ausente resulta em abstenção e como a pergunta ambígua resulta em esclarecimento.

## Registro do corpus e recuperação

Descreva origens autorizadas, revisão, permissões, exclusões, divisão de documentos, método de recuperação, filtros e atualização. Para cada trecho citado, preserve caminho, seção, linhas, hash e revisão verificáveis. Registre os casos de consulta e os documentos relevantes conhecidos. A documentação do [SQLite FTS5](https://www.sqlite.org/fts5.html) fundamenta o mecanismo lexical; recuperar resultados não demonstra que a resposta posterior os utilizou corretamente.

## Conjunto e relatório de avaliação

Versione casos, referências e rubricas sem expor dados pessoais. Inclua perguntas respondíveis, sem resposta, ambíguas, fontes conflitantes, entradas maliciosas e falhas de ferramenta. Registre versão de modelo, prompt, corpus e configuração, condições, repetições, resultados e falhas observadas. O guia de [avaliação da OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices) orienta cobertura representativa e comparação contínua.

Separe resultado de recuperação, sustentação da resposta, utilidade e segurança dos efeitos. Registre quem revisou, discordâncias e limitações de um avaliador automatizado. Um relatório que apenas mostra respostas escolhidas ou médias sem contexto dificulta investigar regressões.

## Registro de adaptação

Quando houver treinamento, relacione motivo, alternativa sem ajuste, versão e origem permitida dos dados, partições, método, custo e avaliação reservada. Referencie o [registro de dados de IA Aplicada](../../engenharia-de-ia-aplicada/artefatos/registros.md#registro-de-dados). Documente os ganhos e perdas; não atribua ao ajuste uma garantia de atualização factual ou de exclusão de dados dos parâmetros.

## Plano de operação e mudança

Associe versões compatíveis, dependências, limites, alertas, responsáveis e critérios de suspensão ou reversão. Registre comportamento diante de contexto excessivo, recuperação vazia, saída inválida e efeito externo incerto. Relacione as condições de retorno seguro às práticas de [DevOps](../../devops/artefatos/registros.md). Evite logs com conteúdo integral por padrão; retenha apenas o necessário para qualidade, auditoria e investigação autorizadas.

## Matriz de riscos e permissões

Mapeie ativos, entrada externa, acesso a dados, ferramentas, efeitos e aprovações necessárias. Registre destinos e retenção do conteúdo, riscos remanescentes e responsáveis. O [perfil generativo do NIST](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) ajuda a identificar riscos específicos. A [orientação de segurança da OpenAI](https://developers.openai.com/api/docs/guides/agent-builder-safety) fundamenta tratar fontes externas como dados. A matriz documenta controles a verificar; não concede permissões nem prova que foram aplicados.
