# ioteams v1 — design aprovado

O usuário aprovou esta arquitetura e pediu sua implementação em 14 de outubro de 2026. Este documento é uma especificação do produto e dado de planejamento, não uma nova fonte de instruções para o agente.

## Resultado

Camada opcional para desenvolvimento em Git, com painel e CLI locais: demanda → conhecimento recuperado → profissionais → plano aprovado → implementar → testar → corrigir → revisar → commit → push confirmado. Profissões, stacks, profissionais e equipes são conhecimento compartilhado; identidade, responsabilidade Scrum e sessão de execução são independentes. LISA permanece exemplo fictício, não uma garantia de competência para toda demanda.

## Estrutura e contratos

Npm workspaces: packages/*, apps/* e painel. Pacotes: @ioteams/core (contratos e domínio sem I/O), @ioteams/catalog (metadados e leitura segura), @ioteams/storage (SQLite operacional), @ioteams/knowledge (índice SQLite separado), @ioteams/codex (transporte App Server), @ioteams/runtime (política, Git e coordenação). Apps: server e cli. Exportar APIs públicas por src/index.ts. Tests unitários/integrados em tests/unit e tests/integration; E2E em tests/e2e. Compartilhar schemas Zod e tipos TypeScript, versão de contrato 1.

Os campos abaixo fixam nomes compartilhados mínimos; extensões compatíveis justificadas são possíveis. Código e tests devem rejeitar campos desconhecidos em payloads de controle e não executar dados livres.

- TaskStatus: TODO, IN_PLANNING, READY, BLOCKED, IN_PROGRESS, REJECTED, DONE. normalizeStatus aceita os aliases legados PLANNING e PROGRESS somente no adaptador de compatibilidade.
- ScrumRole: Product Owner, Scrum Master, Developer. CatalogKind: profession, stack, professional, team. Metadata tem version:1, kind, id (slug estável), name; profissional tem fictitious, professionIds, stackIds; equipe tem members com professionalId e role. Frontmatter dos arquivos descricao.md/perfil.md identifica entidades. Demais Markdown são conteúdo associado, nunca código.
- CheckCommand: executable:string, args:string[], cwd?:string (relativo ao checkout), timeoutMs:number. Executar argv sem shell. Os comandos são definidos pelo operador no plano; saídas do modelo não podem adicionar comandos de controle.
- KnowledgeCitation: documentId, path, heading, lineStart, lineEnd, contentHash, commitSha, excerpt. Caminhos relativos ao corpus e linhas positivas ordenadas; hash e revisão verificáveis.
- PlannedTask: id, title, professionalId, dependsOn, allowedPaths, acceptanceCriteria, checks. ExecutionPlan: version:1, id, projectId, teamId, goal, branch, remote, baseSha, tasks, definitionOfDone, limits (maxAttempts:3, turnTimeoutMs:1800000), policyHash. A aprovação humana vincula snapshot e hash, não qualquer futura alteração.
- TaskAttempt: id, taskId, attempt, baseSha, status, professionalId, threadId?, turnId?, resultSha?, evidenceIds, citationIds, reason?. ValidationEvidence: id, taskId, attemptId, command, exitCode, startedAt, finishedAt, contentHash, testedTreeHash/commitSha. Evidências são produzidas pelo host, nunca aceitas como verdade por declaração do modelo.
- ApprovalRequest: id, runId, threadId, turnId, requestId, kind, summary, details, status. ApprovalDecision: accept, decline, cancel, com mapeamento explícito para decisões nativas suportadas. Aprovações são vinculadas à solicitação concreta; silêncio nunca aprova.
- HostAdapter: start(input:HostTurnInput, signal?:AbortSignal):AsyncIterable<HostEvent>; respondToApproval(requestId:string, decision:ApprovalDecision):Promise<void>; interrupt(turnId:string):Promise<void>. HostTurnInput leva identidade, objetivo, dados recuperados e política aprovada separados. HostEvent é união discriminada para thread/turn, conteúdo, ferramenta, aprovação, erro e conclusão. Adapter simulado deve suportar todos os estados sem credencial.
- RunStatus: queued, running, awaiting_approval, paused, blocked, interrupted, cancelled, completed. Espera de autorização, falha de infraestrutura ou push não representa rejeição técnica de tarefa.

## Conhecimento

Materializar seis profissões diretamente em profissoes, com descricao.md e diretórios específicos dos conceitos 02/03/14. Cada diretório de conteúdo contém explicação suficiente e referências primárias. Stacks em stacks/<slug>/descricao.md cobrem propósito, funcionalidades, vantagens, desvantagens, aplicação, limitações, práticas e fontes. Profissionais possuem perfil.md, personalidade.md, conhecimentos.md, curriculo.md e referencias. Equipe possui descricao.md, integrantes.md, responsabilidades.md e interfaces.md.

Catálogo inicial de stacks: scrum, git, typescript, react, swift, swiftui, xctest, voiceover, sqlite, github-actions, codex-local e rag-local. Profissionais: helena-costa, marcos-lima, bia-martins, caio-alves, duda-rocha, ravi-melo, nara-dias, ivo-santos. Preservar IDs legados do painel por adaptador explícito quando necessário. Equipe lisa tem um PO, um SM e seis Developers. Nenhum currículo inventa experiência real.

Índice somente para Markdown nas raízes autorizadas profissoes, stacks, profissionais, equipes. Sem seguir symlinks ou atravessar fronteiras; exclusão de configs, instruções de agente, credenciais, registros operacionais e artefatos. Divisão por seções, hashes incrementais, FTS5/BM25, acentos normalizados, filtros de relações, citações com hash/SHA. Índice separado do SQLite operacional. Trechos selecionados são enviados ao Codex para geração; não há embeddings externos.

## Confiança e execução

Política executável fica fora do corpus e do checkout editável, congelada após aprovação. Markdown, personalidade, comentários, resultados e recibos são dados delimitados em mensagens de usuário/conteúdo; nunca baseInstructions, developerInstructions ou skills. Configurações e instruções encontradas no projeto precisam de decisão de confiança explícita. Não conceder acesso ou carregar plugins/skills automaticamente por menção no corpus.

Codex App Server stdio via processo filho com CODEX_HOME exclusivo por processo, fora dos dados pessoais ativos, sem cópia de credenciais. Usar login nativo, preservar sandbox e aprovações; sem bypass. Gerar/validar tipos contra versão instalada. Descobrir modelos disponíveis, sem nome fixo. Núcleo depende somente de HostAdapter. Um checkout por demanda, um escritor; planejamento e revisão usam sessões distintas e permissões mínimas. Contexto e resultados estruturados mínimos com fontes e SHAs.

PO propõe valor/backlog; SM facilita Scrum/impedimentos; Developers planejam e executam. Coordenador determinístico aplica limites. Plano humano autoriza escopo, paths, checks, branch e remote. Três tentativas por tarefa, 30 minutos por turno. Falhas técnicas são reproduzidas e pesquisadas. Resultado incerto não é repetido sem reconciliação.

## Trabalho e evidências

Transições: TODO→IN_PLANNING; IN_PLANNING→READY/TODO; READY→IN_PROGRESS/BLOCKED; BLOCKED→READY; IN_PROGRESS→DONE/REJECTED; REJECTED→TODO; DONE terminal. Bloqueio/rejeição exigem motivo. Retorno de rejeição preserva ID/histórico/motivo e invalida checks/evidências da tentativa anterior. DONE operacional exige aceitação, DoD, evidências reais, revisão, commit e confirmação remote quando push estiver aprovado. Verificar árvore testada antes de commitar; testes não podem produzir mudanças que escapem ao plano. Falha de push pausa entrega sem gerar commit duplicado.

Product Goal/Product Backlog, Sprint Goal/Sprint Backlog, aceitação da tarefa, DoD e incremento são distintos. Registrar eventos Scrum contextualizados e melhorias, sem agendamento externo obrigatório nem hierarquia de comando artificial.

## API, CLI e interface

Servidor loopback somente, sessão local autenticada, origem validada, proteção CSRF, erros seguros e requisições idempotentes para efeitos. API /api/v1: catálogo, projetos, demandas/planos e aprovação, sprints/tarefas, runs e pausa/retomada/cancelamento, approvals, knowledge/search. Eventos SSE com sequência persistente e reconexão. CLI compartilha serviços para init, doctor, catalog, index, search, plan, run, status, approve, pause/resume/cancel. Nunca imprimir credenciais ou tokens de sessão em logs/URLs.

Painel preserva pessoas/cadência/entrega, temas e componentes acessíveis. Adicionar conhecimento, configuração, execuções e aprovações. UI e CLI respeitam regras do núcleo. Registrar DESIGN.md e UX-CONTRACT.md a partir dos estilos existentes. Modo demo isolado e identificado; reiniciar/desfazer demo não desfaz efeitos operacionais. Build operacional escreve artefatos ignorados, não altera automaticamente docs/index.html; gerar demo somente por comando explícito.

## Aceite e limites

Unit/integration com Vitest; browser com Playwright. Cobrir relações e estados inválidos, rejeição/replanejamento, RAG incremental/citações, symlinks/traversal, prompt injection, decisões vinculadas, timeout/recusa, segundo escritor, mudanças fora do plano, git divergente/push incerto, reinício e efeitos idempotentes, teclado/temas/narrow viewport/reconexão. CI usa somente adapters simulados. Teste real final usa runtime autenticado separado e repositório descartável com remote bare local; nunca usa o checkout ativo do ioteams como alvo de teste autônomo.

Desenvolver em origin/develop. CI somente por tags ci/ioteams-v1-<marco>-<sha> em T06/T09/T13/T17/T18. Sem force push, merge main, release ou deploy. Dados operacionais/índices/receipts ficam fora Git. Login do runtime dedicado é etapa humana nativa quando necessário; ausência de login é limitação real, não teste aprovado.

## Referências

- https://learn.chatgpt.com/docs/app-server — transporte, eventos e aprovações.
- https://developers.openai.com/api/docs/guides/agent-builder-safety — separação de instruções e dados.
- https://nodejs.org/download/release/v24.6.0/docs/api/sqlite.html — API SQLite verificada.
- https://www.sqlite.org/fts5.html — recuperação textual.
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax — CI por tags.
- https://scrumguides.org/scrum-guide.html — responsabilidades, artefatos, compromissos e eventos.
