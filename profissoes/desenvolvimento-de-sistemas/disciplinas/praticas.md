# Disciplinas e práticas de desenvolvimento

[Descrição da profissão](../descricao.md)

As disciplinas descrevem perguntas diferentes sobre o mesmo sistema. Uma pessoa pode contribuir com várias delas, e cada entrega pode exigir colaboração entre especialidades. A classificação segue o [recorte local de Desenvolvimento de Sistemas](../../../docs/conceitos/02-profissoes.md#desenvolvimento-de-sistemas).

## Requisitos

Comece pela necessidade, pelo público e pelo resultado observável. Separe regra de negócio, hipótese de produto, restrição técnica e qualidade esperada. Um requisito como “buscar melhor” precisa de contexto: buscar o quê, com quais termos e em que situação? Exemplos de entrada e saída revelam ambiguidades antes da implementação.

Na busca por competências, registre como tratar acentos, resultados vazios e filtros combinados. Defina critérios de aceitação que possam ser observados, e mantenha dúvidas explícitas. Restrições de acessibilidade devem entrar nessa conversa desde o início; o [planejamento de acessibilidade da WAI](https://www.w3.org/WAI/planning/) orienta sua incorporação ao projeto.

## Experiência e acessibilidade

Descreva a jornada completa, incluindo aprendizado, erro e recuperação. Avalie linguagem, ordem de interação e compatibilidade com tecnologias assistivas. A [WCAG 2.2](https://www.w3.org/TR/WCAG22/) organiza requisitos verificáveis para conteúdo web em torno de percepção, operação, compreensão e robustez. Conformidade precisa de avaliação apropriada; a presença de uma biblioteca de componentes não a comprova.

No exemplo, uma pessoa deve alcançar o campo e os resultados por teclado, compreender os nomes dos controles e perceber o resultado da ação. [Envolver pessoas com deficiência na avaliação](https://www.w3.org/WAI/test-evaluate/involving-users/) acrescenta evidências sobre experiência que uma ferramenta automática não fornece sozinha. A versão web dessas referências não substitui as orientações da plataforma para uma aplicação nativa.

## Interfaces

Transforme a jornada em interações consistentes. Campos precisam de identificação, instruções e mensagens de erro úteis; feedback de sucesso deve ser perceptível. O [tutorial de formulários da WAI](https://www.w3.org/WAI/tutorials/forms/) explica essas relações. Na busca, distinga carregamento, ausência de resultados e falha. Preservar a consulta após uma falha permite corrigir ou tentar novamente sem recomeçar.

A interface depende do contrato do serviço: se não há distinção entre erro e lista vazia, a pessoa recebe uma explicação incorreta. Revise esse encontro entre camadas com exemplos reais, evitando corrigir um problema de contrato apenas com texto visual.

## Serviços e integração

Defina operações, parâmetros, respostas e erros antes de integrar consumidores independentes. A [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) descreve interfaces HTTP de forma estruturada; um documento de contrato ajuda a comparar expectativas de cliente e servidor. Ele não implementa autenticação, validação ou autorização por conta própria.

Para a busca, explicite filtros aceitos, paginação quando necessária e formato dos resultados. Para operações com efeitos, discuta duplicação, falhas parciais e recuperação antes de adotar novas tentativas. Um timeout deixa o resultado incerto; a estratégia de reconciliação depende do contrato da operação. Registre essa decisão nos [artefatos](../artefatos/rastreabilidade.md).

## Dados

Modele identidades, relações, invariantes e evolução do formato. Uma competência vinculada a uma profissão inexistente é uma inconsistência de domínio, mesmo que os campos sejam strings válidas. [Chaves estrangeiras no SQLite](https://www.sqlite.org/foreignkeys.html) exemplificam como impor relações; seu funcionamento precisa ser habilitado e verificado na conexão, conforme a configuração usada.

Mudanças que precisam acontecer juntas requerem uma fronteira de atomicidade. A documentação de [transações SQLite](https://www.sqlite.org/lang_transaction.html) explica commit e rollback. No desenvolvimento, planeje migração, recuperação e testes de interrupção proporcionais ao risco. Um índice de consulta derivado pode ser reconstruível; os registros originais exigem outra política de preservação.

## Validação

Combine verificações de regras isoladas, integrações e jornadas completas. Escolha casos a partir de falhas relevantes: relação inexistente, filtro inválido, erro de persistência, foco perdido e incompatibilidade de contrato. As [práticas do Playwright](https://playwright.dev/docs/best-practices) orientam testes de comportamento visível, isolamento e seletores ligados à experiência do usuário.

Testes automatizados tornam regressões observáveis, mas não substituem toda avaliação de experiência. Registre o que foi exercitado, a revisão verificada e as limitações. Uma falha reproduzida orienta a correção; repetir o mesmo comando sem investigar a causa acrescenta pouca informação. O [ciclo de aprendizado](../ciclos/aprendizado.md) relaciona essas evidências às decisões seguintes.
