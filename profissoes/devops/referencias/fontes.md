# Referências de DevOps

[Descrição da profissão](../descricao.md)

As fontes primárias abaixo sustentam temas específicos, com sínteses próprias e exemplos locais. DevOps não é tratado como um padrão único nem como uma coleção obrigatória de ferramentas. A divisão dos pilares pertence ao catálogo do ioteams, conforme a [organização das profissões](../../../docs/conceitos/03-organizacao-das-profissoes.md).

## Mapa das fontes

| Fonte primária | Recorte | Aplicação e limite |
| --- | --- | --- |
| [DORA — Continuous delivery](https://dora.dev/capabilities/continuous-delivery/) | Capacidade de entregar sob demanda, práticas e feedback. | Distingue entrega e deployment contínuos; não prescreve um pipeline para todo produto. |
| [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) | SLI, SLO e SLA. | Ajuda a tornar expectativas mensuráveis; metas dependem das pessoas e do serviço. |
| [Google SRE — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) | Aprendizado com incidentes. | Fundamenta análise sem culpa e melhorias acompanháveis; não elimina responsabilidade por ações. |
| [CNCF — Platforms White Paper](https://tag-app-delivery.cncf.io/whitepapers/platforms/) | Plataforma interna como produto. | Orienta autosserviço e experiência; não obriga adoção de nuvem ou Kubernetes. |
| [HashiCorp — What is Terraform](https://developer.hashicorp.com/terraform/intro) | Exemplo de infraestrutura como código declarativa. | Ilustra configuração, plano e aplicação; não estabelece compatibilidade com qualquer provedor. |
| [OpenTelemetry — Observability primer](https://opentelemetry.io/docs/concepts/observability-primer/) | Métricas, logs, spans e traces. | Explica instrumentação e correlação; não escolhe um backend nem garante diagnóstico completo. |
| [NIST — SP 800-218, SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) | Práticas de desenvolvimento seguro integráveis ao ciclo de vida. | Conecta entrega e segurança; não comprova conformidade do produto. |

## Leitura e manutenção

Consulta em 14 de outubro de 2026. O SSDF citado é a publicação final 1.1 de fevereiro de 2022; a versão está identificada sem afirmar que seja a única disponível. Documentações de projetos e ferramentas evoluem. Antes de usar detalhes de configuração, confira a versão adotada e valide o comportamento no ambiente pertinente.

Os [pilares](../pilares/praticas.md), [ciclos](../ciclos/evolucao.md) e [artefatos](../artefatos/registros.md) relacionam fontes e decisões. Para semântica de contratos, falhas parciais e controles internos da aplicação, siga as [referências de Engenharia de Software](../../engenharia-de-software/referencias/fontes.md), preservando seu recorte.
