# Contrato UX — ioteams local

Visual: [DESIGN.md](DESIGN.md). Idioma pt-BR; usuário único no navegador local. As regras de domínio continuam nos contratos compartilhados e nos serviços.

## Fontes de contexto de negócio

| Área | Fonte | Consequência para a UI |
|---|---|---|
| Escopo e confiança | [Design aprovado](docs/superpowers/specs/2026-10-14-ioteams-v1-design.md) | Conhecimento é dado; decisões humanas e evidências ficam distintas. |
| Controle HTTP | [Contratos da API](apps/server/src/contracts.ts) | Payload estrito, versão, hash e idempotência; sem política executável enviada pelo browser. |
| Sessão e permissões | [Servidor local](apps/server/src/server.ts) | Host/Origin exatos, capacidade privada de uso único, cookie HttpOnly/SameSite e CSRF em memória. |
| Demanda e planejamento | [Serviços](apps/server/src/services.ts) | Depois da tentativa, demanda imutável inclusive em lacuna; criar novo binding pela CLI. |
| Ciclo de execução | [Contratos do núcleo](packages/core/src/contracts.ts) | Estados reais e aprovações vinculadas; nenhum avanço manual de tarefas. |
| Exclusão, cobrança e jurídico | Sem fluxo nesta etapa | Nenhum controle de exclusão, pagamento ou consentimento inventado. |

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | FieldSelect e components/ui/select | DESIGN.md e Radix | authored | E2E teclado, popup e foco |
| Form | schemas compartilhados, useAction e form-field | API contracts | demanda e acesso privado | E2E validação e falha |
| Scrollbar | painel/src/styles.css global | DESIGN.md | quadro horizontal e diálogo limitado | CSS computado e viewport |
| Toast | Notice em components/panel-ui | Este contrato | persistente operacional e toast transitório demo | status/alert no E2E |
| CRUD | services/client e serviços HTTP | API contracts | salvar rascunho e manter formulário | E2E demanda/plano |

Table Selection e Date não se aplicam: não há seleção de tabela nem campo de data. Não criar primitivos paralelos aos owners acima.

## Fluxos e navegação

Trabalho inspeciona pessoas, sprints e tarefas reais. Conhecimento oferece catálogo e citações verificáveis. Configuração mostra primeiro a projeção pura do binding e permite somente objetivo/requisitos coerentes com slots confiáveis. Projeto, repositório, equipe, branch, remote, checks e escopo exigem nova política revisada na CLI para mudança. GET de bindings nunca cria workspace.

Salvar demanda mantém o formulário e anuncia confirmação do serviço. Os requisitos são uma seleção local até Propor plano; isso é indicado antes da seleção. Propor plano, Aprovar este hash e Iniciar execução são três ações distintas com confirmação. A aprovação envia o hash completo exibido; a execução nunca começa automaticamente. Lacunas não oferecem replanejamento no mesmo ID. Execuções e aprovações usam versão e confirmação da solicitação concreta.

Navigation guard preserva os campos nesta aba e avisa ao trocar vista; page unload usa exclusivamente beforeunload quando há alterações. Não há persistência de drafts nem credenciais em localStorage. Hash de rota é a única informação de navegação persistida. Consultas de conhecimento são transitórias e potencialmente sensíveis: não entram na URL/histórico. Catálogo e execuções usam Mostrar mais de 20 em 20.

### Route document title policy

Cada vista define `{Vista} · ioteams`; checagem e acesso fechado têm títulos próprios. `/demo` conserva o cenário e a identificação fictícia, sem montar o cliente operacional.

### Route error / 403 page behavior

Hash desconhecido mostra Página não encontrada com retorno ao trabalho. API 401 fecha os controles, preserva dados não sensíveis na memória e mostra acesso privado. 403 explica a barreira de sessão/origem, sem ocultar como 404. 5xx e desconexão mostram banner persistente e Reconectar. Nenhum erro imprime stack, tokens ou payload bruto.

## Estado remoto e recuperação

Leituras usam AbortController e descarte de resposta anterior. SSE reabre a conexão com cursor nativo e dispara nova leitura dos registros; metadata não é conteúdo dos eventos Scrum. Depois de reconectar ou retornar à aba, revalidar dados. Até isso acontecer, conteúdo retido é potencialmente desatualizado e ações ficam bloqueadas quando há falha de leitura.

Mutação pessimista, bloqueio síncrono contra duplo clique, chave idempotente por envio e nenhuma repetição automática. Timeout/JSON inválido após envio significa resultado incerto; bloquear novas ações desse fluxo e instruir reconciliação na CLI antes de repetir. 409 preserva texto e exige atualização. Não há fila offline. Sessão expirada preserva o formulário não sensível em memória; código de acesso é apagado após a tentativa.

Busca remota usa debounce de 300ms, Enter imediato fora de composição IME, clear imediato com retorno de foco e cancelamento/geração para respostas fora de ordem. Vazio, sem correspondências, índice vazio, fontes alteradas e limite de contexto são mensagens distintas. Citações exibem caminho/linhas, revisão, hash e trecho como texto, sem executar Markdown.

## Acessibilidade e estabilidade

Alvo WCAG 2.2 AA: HTML semântico, labels e nomes pt-BR, foco visível, diálogo Radix com Cancelar inicial, trap/Escape/restauração, estado textual além de cor, noValidate e aria-invalid/describedby. Native select/date não são usados. Popup authored acompanha o trigger e respeita viewport. Document scroll preserva formulários longos; narrow, temas e reduced motion são exercitados em navegador.

O feedback crítico é persistente e associado ao fluxo. Busy mantém o rótulo/geometria e anuncia estado. A simulação possui desfazer em memória; esse recurso não aparece nos efeitos operacionais.

## Evidência mantida

[Cliente tipado](tests/unit/painel/client.test.ts), [bootstrap e projeção](tests/integration/server/browser.test.ts), [launcher privado](tests/integration/cli/serve.test.ts), [fluxo operacional](tests/e2e/panel.spec.ts) e [demo](tests/e2e/demo.spec.ts). Auditoria estática complementa, sem substituir, typecheck, suíte, build e navegador.
