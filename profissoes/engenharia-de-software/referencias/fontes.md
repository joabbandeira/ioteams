# Referências de Engenharia de Software

[Descrição da profissão](../descricao.md)

As fontes primárias abaixo fundamentam recortes diferentes da profissão. O conteúdo é uma síntese própria com exemplos locais; não representa uma certificação ou uma norma única de engenharia. A [organização das profissões](../../../docs/conceitos/03-organizacao-das-profissoes.md) define os agrupamentos usados pelo catálogo.

## Mapa das fontes

| Fonte primária | Recorte e versão | Aplicação e limite |
| --- | --- | --- |
| [CMU SEI — Quality Attribute Workshop Collection](https://www.sei.cmu.edu/library/quality-attribute-workshop-collection/) | Atributos críticos e cenários de qualidade; coleção publicada em 2016. | Ajuda a esclarecer necessidades antes da arquitetura; não escolhe a solução pelo projeto. |
| [Martin Fowler — Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) | Explicação do padrão de modelagem, de 2014. | Esclarece limites semânticos e relações; não implica decomposição em microserviços. |
| [OpenAPI Initiative — OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) | Descrição de interfaces HTTP. | Apoia contratos; não implementa regras, segurança ou compatibilidade comportamental. |
| [SQLite — Transaction](https://www.sqlite.org/lang_transaction.html) | Fronteiras transacionais e concorrência. | Exemplifica garantias no banco; não cria atomicidade universal entre sistemas. |
| [AWS Builders' Library — Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Semântica de novas tentativas e identidade da intenção. | Orienta efeitos repetíveis; exige definir escopo e retenção da identidade. |
| [SQLite — How SQLite Is Tested](https://www.sqlite.org/testing.html) | Combinação de técnicas e testes de falhas. | Exemplo de rigor; cada produto escolhe verificações proporcionais aos seus riscos. |
| [OWASP — ASVS 5.0.0](https://owasp.org/projects/asvs) | Requisitos verificáveis de segurança web. | Apoia controles e evidências; não comprova sozinho a segurança do produto. |

## Leitura e manutenção

Fontes consultadas em 14 de outubro de 2026. OpenAPI 3.1.1 e ASVS 5.0.0 são as versões identificadas nesta síntese, sem afirmar exclusividade ou adoção obrigatória. Referências conceituais antigas continuam identificadas pela data; documentação de ferramentas deve ser conferida com a versão usada antes de aplicar detalhes de implementação.

Consulte os [pilares](../pilares/praticas.md), [ciclos](../ciclos/evolucao.md) e [artefatos](../artefatos/registros.md) para relacionar as fontes a decisões. Para entrega, objetivos operacionais, observabilidade e incidentes, use as [referências de DevOps](../../devops/referencias/fontes.md), preservando uma explicação canônica de cada recorte.
