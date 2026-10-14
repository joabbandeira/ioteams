# Artefatos de Engenharia de Software

[Descrição da profissão](../descricao.md)

Artefatos preservam decisões e evidências para quem constrói, revisa e mantém o produto. Seu tamanho depende da incerteza e do custo da mudança. Identifique contexto, responsável, revisão e relações entre registros. Exemplos deste catálogo explicam o trabalho; não substituem políticas operacionais ou autorizações do projeto de destino.

## Decisões arquiteturais

Uma decisão arquitetural (ADR) registra problema, forças relevantes, alternativas, escolha e consequências. Inclua premissas, riscos e condições para revisar a decisão. Cenários de qualidade, como os discutidos pelo [SEI](https://www.sei.cmu.edu/library/quality-attribute-workshop-collection/), permitem comparar alternativas por necessidades concretas.

No exemplo, escolher índice separado ou consulta direta exige explicar custo, latência e atualização. Um diagrama de contexto pode mostrar pessoas, componentes externos e fronteiras; outro de dependências pode esclarecer responsabilidades internas. Preserve a relação entre diagrama e decisão, evitando uma imagem sem significado operacional.

## Modelos e contratos

Um glossário esclarece conceitos e identidade; modelos de relações e estados representam regras e transições. O conceito de [Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) ajuda a localizar o significado de cada modelo. No exemplo, profissão e função na equipe devem permanecer distinguíveis em nomes, relações e validações.

Uma especificação de contrato registra entradas, respostas, erros, efeitos, invariantes e compatibilidade. [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) é uma opção para interfaces HTTP. Acrescente exemplos de comportamento e falhas; não confunda documento de schema com implementação de autorização ou garantia de corretude.

## Estratégia e evidências de verificação

A estratégia relaciona riscos a verificações, ambientes e resultados esperados. As evidências registram revisão exercitada, comando ou procedimento, resultado observado e limites. Testes unitários, de integração, jornadas e revisão devem responder perguntas complementares. A experiência de [testes do SQLite](https://www.sqlite.org/testing.html) oferece exemplos de técnicas para falhas, entradas inválidas e invariantes.

Para a busca, relacione cada regra relevante ao caso que a verifica. Uma falha corrigida deve ter uma reprodução útil, e o resultado deve corresponder à revisão final. O [registro de entrega em DevOps](../../devops/artefatos/registros.md#mudança-e-entrega) consome essas evidências e acrescenta a observação do ambiente de destino. Cobertura e contagem de testes não substituem a avaliação do comportamento exercitado.

## Modelo de ameaças

O modelo de ameaças descreve ativos, atores, entradas, fronteiras de confiança, possíveis abusos e consequências. Relacione cada risco relevante a um controle, uma evidência e eventuais riscos residuais. Os requisitos do [OWASP ASVS 5.0.0](https://owasp.org/projects/asvs) ajudam a especificar verificações técnicas de aplicações web; identifique a versão ao referenciar requisitos.

No exemplo, um arquivo de catálogo malformado pode tentar alcançar caminhos externos ou induzir um efeito não autorizado. O modelo orienta limites de leitura e validação; os testes devem exercitar a recusa no consumidor real. Revise o registro quando uma integração muda. Complete a análise com a [segurança da operação](../../devops/pilares/praticas.md#segurança-da-operação), que cobre recursos e entrega.

## Plano de evolução

Uma mudança de contrato ou dados registra consumidores afetados, pré-condições, transição, verificação e recuperação. Inclua o que acontece se a execução parar parcialmente. A documentação de [transações SQLite](https://www.sqlite.org/lang_transaction.html) ilustra garantias e limites no banco; efeitos em outros componentes precisam de tratamento explícito.

Para o índice de busca, distinga substituição de dados derivados e alteração irreversível dos dados originais. Relacione o plano à decisão arquitetural e às evidências de compatibilidade. Os [ciclos de evolução](../ciclos/evolucao.md) explicam como esses registros são atualizados com os resultados reais.
