# Pilares e práticas de DevOps

[Descrição da profissão](../descricao.md)

Os pilares organizam decisões sobre o sistema em uso e sua capacidade de mudar. A colaboração atravessa todos eles: tornar riscos, evidências e responsabilidades visíveis ajuda a evitar uma entrega que termina quando o código sai das mãos de quem o escreveu. Os exemplos abaixo são sínteses locais, não uma política de execução ou uma stack obrigatória.

## Entrega contínua

Entrega contínua mantém o software em condição de ser disponibilizado quando necessário. Integração frequente, verificações confiáveis e automação de build e entrega sustentam essa capacidade. Deployment contínuo acrescenta a disponibilização automática das mudanças aprovadas pelas verificações; a capacidade de entregar sob demanda não exige adotar essa automação final. Essa distinção é explicitada pela [DORA](https://dora.dev/capabilities/continuous-delivery/).

No exemplo da busca, associe o pacote à revisão verificada e identifique como confirmar seu funcionamento no ambiente de destino. Uma mudança de formato de dados precisa de estratégia compatível com a versão anterior e com a recuperação. Os critérios de [verificação do software](../../engenharia-de-software/pilares/praticas.md#verificação) orientam quais falhas o pipeline deve revelar. Uma verificação vermelha é evidência a investigar, e um pacote gerado não comprova que a entrega chegou ao usuário.

## Operação

Operar é acompanhar o comportamento do sistema, atender necessidades recorrentes e manter condições de recuperação. Explicite quem atende cada componente, quais dependências existem, como reconhecer degradação e quando envolver outras pessoas. Reduza tarefas manuais repetidas com automação verificável, sem esconder seus efeitos ou retirar a possibilidade de diagnóstico.

Para a busca, diferencie uma lista vazia válida de um índice indisponível. Um [runbook](../artefatos/registros.md#runbooks-e-recuperação) deve indicar sintomas, diagnóstico, limites de atuação e sinais de recuperação. Revise procedimentos depois de usá-los. O aprendizado com falhas segue a abordagem de [postmortems do Google SRE](https://sre.google/sre-book/postmortem-culture/), que examina condições contribuintes e melhorias no sistema.

## Confiabilidade

Confiabilidade depende do serviço que as pessoas precisam receber. Um indicador de nível de serviço (SLI) mede um comportamento; um objetivo (SLO) define a meta e sua janela; um acordo (SLA) acrescenta compromissos e consequências. As distinções estão em [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/). Escolha poucos indicadores relevantes e explique suas exclusões.

Um exemplo hipotético seria medir a proporção de consultas válidas concluídas corretamente em até um limite de tempo acordado. Registre população, janela e tratamento de erros; uma média isolada pode esconder consultas muito lentas. Metas não são promessas universais. A tolerância a falhas depende também dos [contratos de sistemas distribuídos](../../engenharia-de-software/pilares/praticas.md#sistemas-distribuídos); disponibilidade aparente não resolve duplicação ou corrupção de efeitos.

## Plataforma

Uma plataforma interna oferece capacidades reutilizáveis com uma experiência coerente: preparar ambientes, obter diagnósticos ou usar um fluxo de entrega. O [white paper da CNCF](https://tag-app-delivery.cncf.io/whitepapers/platforms/) enfatiza plataforma como produto, autosserviço, documentação e redução de carga cognitiva. Investigue as necessidades de seus usuários e permita composição proporcional ao problema.

No exemplo, um comando documentado de diagnóstico pode resolver mais do que um portal complexo. Avalie tempo para a primeira entrega, dificuldades de uso e custo de manutenção. Uma plataforma que concentra todas as decisões em um único time pode tornar-se um gargalo; automação útil precisa de suporte e caminhos claros para exceções.

## Infraestrutura como código

Infraestrutura como código representa recursos e configurações em arquivos revisáveis. A [introdução do Terraform](https://developer.hashicorp.com/terraform/intro) exemplifica um fluxo declarativo de escrever, planejar diferenças e aplicar mudanças. Diferencie intenção, plano calculado e estado observado: uma revisão de configuração não prova que o ambiente corresponde a ela.

Antes de aplicar uma mudança, avalie impacto, dependências, deriva e recuperação. No serviço de busca, isso pode significar revisar armazenamento e permissões de execução. Estado e segredos exigem proteção própria; não devem ser publicados junto da configuração. A ferramenta é um exemplo de abordagem, sem adoção obrigatória pelo ioteams.

## Observabilidade

Observabilidade permite investigar o comportamento por sinais emitidos pelo sistema. Métricas resumem medições, logs registram acontecimentos e traces conectam operações por spans. O [primer do OpenTelemetry](https://opentelemetry.io/docs/concepts/observability-primer/) explica essas relações. Instrumentação útil responde perguntas sobre falhas e desempenho; acumular sinais sem contexto não basta.

Na busca, correlacione o erro da requisição à consulta ao índice e à revisão em execução. Defina alertas que indiquem impacto e uma ação possível, distinguindo sintoma de hipótese causal. Avalie custo, cardinalidade, retenção e acesso: termos consultados podem revelar informações sensíveis. O [registro de observabilidade](../artefatos/registros.md#objetivos-e-observabilidade) relaciona sinais a decisões de operação.

## Segurança da operação

O recorte operacional protege ambientes, identidades de serviço, dependências e o caminho que produz e disponibiliza software. Revise privilégios, acesso a artefatos, gestão de segredos, atualizações e resposta a vulnerabilidades. O [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final) orienta integrar segurança ao ciclo de desenvolvimento; não é uma certificação automática por usar um pipeline.

No exemplo, quem publica um pacote não precisa ler todos os dados do serviço. Logs e backups também exigem controle de acesso. A [segurança de aplicações](../../engenharia-de-software/pilares/praticas.md#segurança-de-aplicações) aprofunda ameaças, autorização e validação dentro do software. As duas perspectivas colaboram: uma aplicação correta pode ser exposta por um ambiente inseguro, e um ambiente restrito não corrige uma falha de autorização.
