# Artefatos e rastreabilidade

[Descrição da profissão](../descricao.md)

Artefatos tornam decisões e resultados consultáveis. Sua utilidade depende da pergunta que respondem; quantidade de documentos não mede qualidade da entrega. Uma mudança pequena pode usar poucos registros conectados. Contratos e modelos mais detalhados são úteis quando há consumidores independentes, regras complexas ou risco de perda de dados.

## Requisitos e jornadas

Um registro de requisito associa necessidade, contexto, exemplos e critérios de aceitação. Uma jornada descreve as ações e informações necessárias do início à conclusão, incluindo falhas. Na busca, “localizar uma competência sem mouse” deve ligar o campo, o envio, os resultados, a seleção e o retorno. Um desenho só do estado preenchido omite parte do comportamento.

Use a [WCAG 2.2](https://www.w3.org/TR/WCAG22/) para identificar critérios web pertinentes e registre o alcance da avaliação. A conformidade não decorre de declarar uma lista de intenções. O [tutorial de formulários da WAI](https://www.w3.org/WAI/tutorials/forms/) ajuda a explicitar identificação de controles, instruções e recuperação de erros.

## Contratos e modelos de dados

Um contrato de interface identifica operações, entradas, saídas e falhas observáveis. Exemplos válidos e inválidos ajudam produtores e consumidores a interpretar os limites. A [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) é uma opção para HTTP, sem ser obrigatória para interfaces locais ou de outra natureza.

Um modelo de dados registra identidade, cardinalidade e invariantes. Uma migração explica a transformação e como lidar com interrupção. Na relação entre profissional e profissão, defina o que acontece quando a referência não existe; a [integridade referencial do SQLite](https://www.sqlite.org/foreignkeys.html) exemplifica uma proteção possível. A validação na aplicação continua necessária para oferecer mensagens e regras do domínio.

## Decisões e evidências

Registre uma decisão material com contexto, alternativas relevantes, escolha e consequências. Por exemplo: manter busca lexical local evita enviar consultas a outro serviço, mas exige avaliar termos e acentos com o próprio acervo. Esse exemplo é uma decisão de produto local, não uma conclusão imposta pelas fontes técnicas.

Uma evidência de validação identifica cenário ou comando, ambiente pertinente, revisão testada e resultado observado. Para uma falha, inclua passos mínimos e expectativa. Capturas e relatórios podem complementar a análise, respeitando privacidade e retenção. Os [testes de comportamento do Playwright](https://playwright.dev/docs/best-practices) ajudam a produzir evidências repetíveis sobre jornadas, sem provar todas as qualidades do sistema.

## Exemplo de encadeamento

| Pergunta | Registro adequado | Exemplo local |
| --- | --- | --- |
| Qual necessidade será atendida? | Requisito e contexto | Encontrar competências usando teclado. |
| Como a pessoa chega ao resultado? | Jornada e estados | Consulta, carregamento, lista ou orientação vazia. |
| Como as partes colaboram? | Contrato e exemplos | Filtro aceito e resposta distinguindo falha de vazio. |
| Que relações são válidas? | Modelo e invariantes | Profissional referencia uma profissão existente. |
| Por que esta solução foi escolhida? | Registro de decisão | Busca local adequada ao escopo atual. |
| O que foi verificado? | Testes e evidências | Cenários, resultados e revisão exercitada. |

Esses registros se conectam às [disciplinas](../disciplinas/praticas.md) e aos [ciclos](../ciclos/aprendizado.md). Em Scrum, podem apoiar o backlog e a DoD, sem substituir os [artefatos e compromissos do framework](../../metodologia-agil-scrum/artefatos/compromissos.md). Um relatório aprovado para um item não equivale automaticamente à qualidade do incremento inteiro.
