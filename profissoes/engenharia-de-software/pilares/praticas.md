# Pilares e práticas de Engenharia de Software

[Descrição da profissão](../descricao.md)

Cada pilar torna explícitas perguntas sobre comportamento e mudança. A profundidade da análise depende dos riscos, das fronteiras de confiança e do custo de corrigir uma decisão. Os exemplos usam uma busca de competências e são explicações do catálogo, sem impor uma arquitetura ou autorizar ações de execução.

## Arquitetura

Arquitetura relaciona responsabilidades, dependências e decisões que condicionam qualidades do sistema. Explicite cenários: diante de um estímulo em certo contexto, qual resposta é necessária e como observá-la? A coleção de [Quality Attribute Workshops do SEI](https://www.sei.cmu.edu/library/quality-attribute-workshop-collection/) fundamenta identificar e priorizar atributos como desempenho, segurança e modificabilidade.

Na busca, separar leitura do catálogo e apresentação pode facilitar testes e evolução. Separar processos acrescenta custo de comunicação e falhas parciais; a vantagem precisa justificar isso. Compare alternativas com os mesmos cenários e registre consequências em uma [decisão arquitetural](../artefatos/registros.md#decisões-arquiteturais). Um diagrama sem responsabilidades e restrições explicadas oferece pouca orientação.

## Modelagem

Modelagem representa conceitos, identidades, relações e regras do domínio. Diferencie nomes semelhantes com sentidos distintos e explicite a fronteira em que cada significado vale. A explicação de [Bounded Context por Martin Fowler](https://martinfowler.com/bliki/BoundedContext.html) descreve modelos coerentes dentro de contextos delimitados e relações explícitas entre eles. A fronteira conceitual não exige um serviço separado.

No catálogo, profissão, profissional e responsabilidade na equipe são conceitos distintos. Um profissional pode conhecer várias profissões sem receber automaticamente uma função Scrum. Um modelo de estados deve indicar transições válidas e condições de recusa. Exemplos de entrada, resultado e erro ajudam a descobrir regras que uma lista de campos não captura.

## Contratos

Contratos definem o comportamento observável de uma fronteira: entradas aceitas, respostas, erros, efeitos e garantias. A [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) exemplifica descrição estruturada de interfaces HTTP. Um schema verifica forma, mas precisa ser acompanhado de semântica, autorização e regras de compatibilidade.

Na busca, defina o significado dos filtros, a ordenação e a diferença entre resposta vazia e erro. Ao evoluir um formato, considere produtores, consumidores e dados já persistidos. Discuta migração e convivência entre versões antes de remover um campo. Os [contratos e modelos](../artefatos/registros.md#modelos-e-contratos) tornam essas decisões consultáveis e testáveis.

## Corretude

Corretude relaciona a execução à especificação: pré-condições, pós-condições e invariantes descrevem o que deve permanecer verdadeiro. Tipos, validação em fronteiras, revisão e testes oferecem evidências complementares. Uma regra como “toda competência vinculada aponta para uma profissão existente” exige verificação de relações, além de validar strings isoladas.

No exemplo, publicar um índice deve preservar uma versão consultável e coerente. A documentação de [transações SQLite](https://www.sqlite.org/lang_transaction.html) mostra fronteiras de commit, rollback e concorrência de escrita. Uma transação no banco não torna atômico um efeito externo arbitrário. Registre as premissas e teste interrupções nas fronteiras reais, sem deduzir garantias apenas da presença de uma tecnologia.

## Sistemas distribuídos

Componentes que se comunicam podem falhar de forma independente. A ausência de resposta não informa, por si só, se uma operação produziu efeito. Defina prazos, limites de tentativas, identidade da operação e reconciliação. A [Builders' Library da AWS](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) explica contratos idempotentes com identificadores de intenção e registro atômico dos efeitos correspondentes.

Idempotência permite repetir a mesma intenção sem duplicar o efeito definido; não equivale a uma garantia universal de execução exatamente uma vez. Explicite escopo, retenção da chave e conflito quando a mesma chave chega com parâmetros diferentes. Para uma reconstrução remota de índice, consulte o estado da operação antes de iniciar outra. Consistência, ordenação e tratamento de mensagens atrasadas precisam de decisões próprias. A [observabilidade em DevOps](../../devops/pilares/praticas.md#observabilidade) ajuda a investigar essas fronteiras, e seus [objetivos de serviço](../../devops/pilares/praticas.md#confiabilidade) expressam o impacto tolerável.

## Verificação

Escolha evidências a partir das falhas que importam: regras isoladas, integração entre contratos e jornadas observadas. Teste entradas inválidas, limites, interrupções e recuperação, além do caminho esperado. A documentação de [como SQLite é testado](https://www.sqlite.org/testing.html) exemplifica combinação de estratégias, incluindo injeção de falhas e fuzzing. É um caso técnico de rigor, não uma exigência de reproduzir sua escala em cada produto.

Para a busca, um teste unitário pode proteger filtros; uma integração verifica publicação e leitura do índice; uma jornada verifica o resultado acessível para a pessoa. Testes por propriedades podem explorar invariantes com entradas geradas. Defina o resultado esperado independentemente da implementação. A [entrega contínua em DevOps](../../devops/pilares/praticas.md#entrega-contínua) incorpora as evidências ao fluxo de mudança; revisão e avaliação humana cobrem dúvidas que automação não resolve.

## Segurança de aplicações

Modele ativos, entradas, agentes e fronteiras de confiança. Autenticação identifica uma entidade; autorização decide quais ações ela pode realizar. Valide dados recebidos e limite efeitos, recursos e exposição de informações. O [OWASP ASVS 5.0.0](https://owasp.org/projects/asvs) oferece requisitos verificáveis de segurança para aplicações web; selecionar requisitos exige considerar o contexto e registrar a versão.

No exemplo, metadados de um catálogo são dados e não devem virar comandos, permissões ou instruções de controle. Avalie acesso indevido, injeção e vazamento em erros. Testes de recusa precisam cobrir identidades e operações distintas. O [modelo de ameaças](../artefatos/registros.md#modelo-de-ameaças) conecta risco, controle e evidência. A [segurança da operação em DevOps](../../devops/pilares/praticas.md#segurança-da-operação) complementa o recorte com ambientes e entrega.
