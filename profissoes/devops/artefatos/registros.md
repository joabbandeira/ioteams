# Artefatos operacionais de DevOps

[Descrição da profissão](../descricao.md)

Um artefato serve a uma decisão e tem alguém que o mantém. Registre contexto, revisão, responsável e limites de validade; prefira informação verificável a formulários extensos sem uso. Os exemplos são modelos conceituais proporcionais ao risco. Dados operacionais, credenciais e evidências privadas têm armazenamento próprio, separado deste catálogo público.

## Mudança e entrega

O registro de entrega conecta objetivo, revisão de origem, identidade do pacote, configurações relevantes, verificações, ambiente de destino e resultado observado. Acrescente limitações, estratégia de recuperação e decisões pendentes. A [DORA](https://dora.dev/capabilities/continuous-delivery/) fundamenta o vínculo entre controle de versão, feedback e capacidade de entrega.

No exemplo, “build aprovado” e “busca verificada no destino” são evidências distintas. Vincule o teste à revisão que ele exercitou. A escolha dos casos pertence à [estratégia de verificação](../../engenharia-de-software/artefatos/registros.md#estratégia-e-evidências-de-verificação); este registro preserva seu resultado no fluxo de entrega.

## Objetivos e observabilidade

Uma ficha de serviço relaciona público, comportamento essencial, dependências, responsável, SLI, SLO, janela e exclusões. Os [objetivos do Google SRE](https://sre.google/sre-book/service-level-objectives/) sustentam a distinção entre medição e meta. Para a busca, documente quais consultas entram na medição e como erros afetam o cálculo.

Um mapa de sinais descreve métricas, logs, traces e sua correlação com perguntas de diagnóstico. O [OpenTelemetry](https://opentelemetry.io/docs/concepts/observability-primer/) explica os sinais; o mapa local acrescenta responsáveis, acesso, retenção e alertas acionáveis. Um dashboard representa dados observados, sem demonstrar sozinho a causa de uma falha.

## Runbooks e recuperação

Um runbook registra finalidade, sintomas, pré-condições, diagnóstico, limites de atuação, alternativas e confirmação do resultado. Inclua contato responsável e data do último exercício. Procedimentos que alteram estado devem explicitar riscos e condições de interrupção. Quem usa o registro ainda precisa das permissões adequadas ao ambiente; o documento não as concede.

Um plano de recuperação também distingue dados originais e derivados, cópias disponíveis, compatibilidade entre versões e critérios de integridade. Para a busca, reconstruir o índice derivado difere de restaurar os dados de origem. Registre o resultado do exercício e o que ficou sem cobertura.

## Incidentes e aprendizado

O registro de incidente preserva impacto, cronologia, evidências, ações e estado da recuperação. O postmortem acrescenta condições contribuintes, incertezas e melhorias com responsável e forma de acompanhar. O [Google SRE](https://sre.google/sre-book/postmortem-culture/) enfatiza aprendizado e revisão colaborativa. Uma hipótese inicial pode ser corrigida sem apagar o histórico do diagnóstico.

No exemplo, vincule a falha de busca ao teste de regressão, à mudança de alerta ou ao ajuste do runbook. A ação precisa permitir avaliar se reduziu o risco; “ter mais cuidado” oferece pouca verificação.

## Infraestrutura e plataforma

Configuração versionada, plano de diferenças e registro de aplicação ajudam a comparar intenção e ambiente. O [Terraform](https://developer.hashicorp.com/terraform/intro) exemplifica esse fluxo. Trate estado, parâmetros privados e segredos conforme sua sensibilidade; o código público deve usar exemplos seguros.

Um catálogo de capacidades da plataforma identifica interface, usuário, suporte, custo e limites. Decisões sobre sua evolução ligam fricção observada ao resultado esperado, seguindo a perspectiva de [plataforma como produto da CNCF](https://tag-app-delivery.cncf.io/whitepapers/platforms/). Consulte os [ciclos](../ciclos/evolucao.md) para entender quando atualizar esses registros.
