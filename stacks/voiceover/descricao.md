---
version: 1
kind: stack
id: voiceover
name: VoiceOver
---
# VoiceOver

## Propósito

Projetar e avaliar experiências utilizáveis com o leitor de tela da Apple. Os [critérios oficiais de VoiceOver](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria) orientam a realização das tarefas comuns sem assistência visual.

## Funcionalidades

Navegar por elementos e grupos, ouvir rótulos, valores e estados, e ativar ações por gestos ou comandos de teclado. A aplicação precisa expor semântica coerente para que a leitura comunique propósito e resultado. [Critérios de navegação e controles](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria).

## Vantagens

Na avaliação de um fluxo, revela ambiguidades que a apresentação visual pode esconder. Para uma consulta de tarefas fictícia, ouvir o nome, o estado e a ação disponível permite verificar se a interface transmite o necessário para decidir o próximo passo.

## Desvantagens

Requer tempo de aprendizagem e testes das jornadas completas. Rótulos excessivos tornam a navegação cansativa; agrupamentos inadequados podem ocultar ações. Uma correção pontual não garante que novas telas mantenham a mesma qualidade.

## Casos de uso

Formulários, listas dinâmicas, modais e mensagens de erro em clientes Apple. Exemplo fictício: abrir uma tarefa, alterar sua prioridade e voltar à lista conservando uma posição de leitura útil, sem depender de cor ou de um ícone sem nome.

## Restrições

Um rótulo presente ou uma auditoria sem achados não prova que o usuário consegue terminar a jornada. Atualizações não devem deslocar o foco inesperadamente, e modais precisam de navegação lógica. [Critérios de foco](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria). O repertório não autoriza capturar telas, gravar áudio ou operar dados de terceiros.

## Boas práticas

Validar ida e volta na navegação e testar estados vazios, erros e alterações assíncronas. Usar descrições concisas e distinguir valor, rótulo e identificador de teste. A [sessão de auditorias](https://developer.apple.com/videos/play/wwdc2023/10035/) mostra como separar identificação de UI e fala útil. No ioteams, incluir tarefas representativas no aceite e complementar automação com avaliação manual e participação de usuários quando disponível.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [VoiceOver evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria) e [Perform accessibility audits for your app, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10035/).

Contexto: [SwiftUI](../swiftui/descricao.md), [XCTest](../xctest/descricao.md), [Desenvolvimento de Sistemas](../../profissoes/desenvolvimento-de-sistemas/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
