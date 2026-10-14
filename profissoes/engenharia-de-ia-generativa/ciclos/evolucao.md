# Ciclos de construção e revisão de IA Generativa

[Descrição da profissão](../descricao.md)

O ciclo organiza aprendizado sobre um comportamento e suas falhas, com alternativas proporcionais ao problema. O guia de [otimização da OpenAI](https://developers.openai.com/api/docs/guides/model-optimization) conecta avaliação, prompts e eventual adaptação; o resultado de uma comparação pode ser manter a solução simples ou reformular o caso de uso.

## Definir comportamento e base de comparação

No assistente fictício, descreva quais perguntas devem receber resposta, esclarecimento ou abstenção. Crie casos de avaliação antes de otimizar o prompt e compare com consulta direta aos procedimentos. Especifique o que precisa de citação e quais ações exigem intervenção humana na [especificação de contexto](../artefatos/registros.md#especificação-de-contexto-e-prompt).

## Construir e inspecionar o contexto

Verifique acesso e versão das fontes; selecione trechos pertinentes e preserve sua proveniência. Comece com um percurso limitado e observável, evitando acrescentar ferramentas sem necessidade. Uma falha com a fonte correta ausente exige examinar o índice e a consulta; uma falha com a fonte presente exige examinar geração e validação. O [registro do corpus](../artefatos/registros.md#registro-do-corpus-e-recuperação) ajuda a distinguir essas causas.

## Comparar alternativas

Mude uma hipótese de cada vez quando isso permitir explicar o resultado: organização do contexto, método de busca, candidato de modelo ou adaptação. Compare versões nos mesmos casos reservados e registre custos e falhas. Evite ajustar continuamente ao conjunto final de avaliação. As [boas práticas de avaliação da OpenAI](https://developers.openai.com/api/docs/guides/evaluation-best-practices) orientam casos ligados ao uso e atualização das avaliações.

## Revisar confiança e liberar

Inspecione respostas incorretas, citações inadequadas, recusas indevidas e tentativas de instrução em fontes. Valide permissões e aprovações no sistema hospedeiro. O guia de [segurança de agentes da OpenAI](https://developers.openai.com/api/docs/guides/agent-builder-safety) fundamenta essa separação entre entrada externa e controle. Defina critérios explícitos de liberação, supervisão e reversão; uma demonstração convincente não substitui o relatório.

## Observar, corrigir e retirar

Acompanhe falhas e feedback autorizado com coleta mínima. Revise versões do corpus, prompt, modelo e ferramentas ao investigar um incidente. Adicione casos novos à avaliação sem apagar o histórico de erros. Se o risco ou a falta de utilidade exigir, suspenda o recurso conforme o [plano operacional](../artefatos/registros.md#plano-de-operação-e-mudança). Trate retenção e descarte de dados, inclusive índices, caches e registros, como parte do encerramento.
