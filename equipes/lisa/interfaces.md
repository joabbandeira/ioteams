# LISA — interfaces de colaboração

[Contexto e escopo](descricao.md) · [Integrantes](integrantes.md) · [Responsabilidades de decisão](responsabilidades.md)

## Trocas dentro da equipe

As interfaces descrevem informações necessárias para colaborar, não transferências de responsabilidade ou uma sequência obrigatória de departamentos. Cada troca precisa explicitar contexto, dúvida, resultado observável e dependência relevante.

| Participantes | Entrada compartilhada | Saída ou acordo esperado |
| --- | --- | --- |
| Helena e Developers | Necessidade, Product Goal, item e exemplos de aceitação | Recorte de valor viável, dúvidas e riscos; Developers elaboram o plano técnico. |
| Marcos e toda a equipe | Impedimento, observações da colaboração e finalidade do evento | Responsável capaz de ajudar, melhoria combinada e forma de inspecionar seu efeito. |
| Bia e Caio | Regras de criação/edição e estados de apresentação | Contrato entre domínio e UI para sucesso, erro, cancelamento e atualização da agenda. |
| Caio e Nara | Identidade do compromisso, relações e requisitos de escrita | Contrato de persistência, restrições e cenários de falha e migração verificáveis. |
| Bia e Duda | Jornada e comportamento de rótulos, foco e ações | Relato de barreira ou evidência de conclusão da jornada com VoiceOver. |
| Duda, Ravi e implementação | Risco, passos de reprodução e resultado esperado | Regressão automatizável quando útil, exploração complementar e correção verificável. |
| Ravi e Ivo | Checks, fixtures, toolchain e destino de execução | Condições reproduzíveis e diagnóstico que distingue falha funcional de infraestrutura. |
| Nara, Caio e qualidade | Alteração de esquema e invariantes de dados | Casos sintéticos de integridade e recuperação, sem operação sobre bases pessoais. |

O [mapa de integrantes](integrantes.md) permite chegar aos perfis e stacks. Detalhes de capacidade ficam nos profissionais; a equipe documenta apenas o que precisa circular entre eles.

## Stakeholders e dependências externas

Helena recebe necessidades e feedback de stakeholders e torna as decisões de valor compreensíveis. A Sprint Review inspeciona o resultado com a equipe e stakeholders; não é uma autorização genérica de publicação. Marcos ajuda a expor impedimentos que dependem da organização, sem conceder acessos.

Ivo combina condições de homologação, runners e contas com seus responsáveis. A entrada inclui finalidade, ambiente e acesso mínimo necessário; a saída precisa identificar o que foi efetivamente autorizado e o que continua pendente. O impedimento de homologação do protótipo é fictício, sem ticket ou acesso real concedido.

A sincronização do objetivo exige definir serviço, formato, política de conflitos e recuperação com responsáveis por backend e segurança. Essa interface é uma lacuna a resolver: não há provedor remoto estabelecido por LISA. Build, assinatura e distribuição Apple também exigem dependências próprias; conhecer uma stack não as fornece.

## Evidências e tratamento de dúvidas

Uma falha técnica deve circular com cenário mínimo, ambiente, revisão e resultado observado, sem segredos ou dados pessoais. Qualidade e implementação examinam a causa e a correção; infraestrutura participa quando o ambiente explica o problema. Uma saída inconclusiva é registrada como incerteza, sem inventar sucesso.

Decisões de produto voltam ao Product Backlog; adaptação de execução volta ao Sprint Backlog; aprendizados de colaboração são inspecionados nos eventos apropriados. Os [artefatos e compromissos](../../profissoes/metodologia-agil-scrum/artefatos/compromissos.md) explicam essa distinção. Histórico, logs, autorizações e IDs de sessões pertencem ao registro operacional da demanda, não à identidade permanente da equipe.

Em outra demanda, revisar estas interfaces e registrar capacidades ausentes antes de comprometer escopo. A existência de profissões de IA e stacks web no catálogo não transforma este exemplo iOS em equipe apta a todos esses trabalhos.
