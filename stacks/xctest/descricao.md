---
version: 1
kind: stack
id: xctest
name: XCTest
---
# XCTest

## Propósito

Verificar comportamento de código e interfaces no ecossistema Xcode. XCTest sustenta suítes existentes e continua relevante para automação de UI e desempenho, mesmo com a alternativa Swift Testing para novos testes de lógica. [Orientação atual de migração](https://developer.apple.com/videos/play/wwdc2026/267/).

## Funcionalidades

Organizar casos e asserções, preparar cenários e verificar resultados. Testes de UI consultam elementos, simulam interações e observam seu estado por XCUIAutomation; a infraestrutura usa informações de acessibilidade. [Modelo de testes de UI](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/testing_with_xcode/chapters/09-ui_testing.html). Auditorias automatizadas também podem detectar problemas comuns de acessibilidade. [Auditorias em XCTest](https://developer.apple.com/videos/play/wwdc2023/10035/).

## Vantagens

Para produtos Apple, integra evidências de regressão ao fluxo de desenvolvimento e permite validar jornadas completas. Manter testes existentes durante uma migração gradual evita descartar cobertura apenas para trocar de framework.

## Desvantagens

Testes de interface dependem do ambiente e podem ser mais lentos ou instáveis que testes focados de domínio. Estados compartilhados e esperas arbitrárias dificultam reproduzir falhas. Métricas de desempenho precisam de condições comparáveis para orientar decisões.

## Casos de uso

Regressões em [Swift](../swift/descricao.md), jornadas em [SwiftUI](../swiftui/descricao.md) e inspeção de acessibilidade. Exemplo fictício: inserir uma tarefa, reabrir a tela e verificar sua persistência, usando dados de teste sem operações em repositórios pessoais.

## Restrições

Uma suíte aprovada cobre seus cenários, sem provar ausência de defeitos. Testes de UI não substituem uso real com [VoiceOver](../voiceover/descricao.md). Swift Testing e XCTest podem coexistir no target, mas a migração deve respeitar as fronteiras entre frameworks. [Migração incremental](https://developer.apple.com/videos/play/wwdc2026/267/). Execução em dispositivos e permissões do host exigem configuração própria; a stack não a concede.

## Boas práticas

No ioteams, planejar casos pela aceitação da demanda, com entradas independentes e resultados observáveis. Preferir identificação estável dos elementos e limpar apenas dados pertencentes ao teste. Registrar toolchain, destino e resultado, distinguir falha funcional de infraestrutura e investigar instabilidade antes de repetir a execução.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [Migrate to Swift Testing, WWDC26](https://developer.apple.com/videos/play/wwdc2026/267/), [UI Testing, arquivo histórico Apple](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/testing_with_xcode/chapters/09-ui_testing.html) e [Accessibility audits, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10035/). O guia arquivado fundamenta conceitos, não versões mínimas atuais.

Contexto: [Engenharia de Software](../../profissoes/engenharia-de-software/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
