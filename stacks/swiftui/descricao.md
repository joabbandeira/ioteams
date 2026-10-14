---
version: 1
kind: stack
id: swiftui
name: SwiftUI
---
# SwiftUI

## Propósito

Descrever interfaces nas plataformas Apple de forma declarativa. A sessão [Demystify SwiftUI](https://developer.apple.com/videos/play/wwdc2021/10022/) explica como identidade, duração e dependências orientam atualizações das views.

## Funcionalidades

Compor views e conectar apresentação a fontes de estado. A identidade de uma view influencia a duração de seu estado; o valor temporário da estrutura que a descreve não é essa identidade. Fontes de verdade e bindings organizam a edição de dados entre views. [Identidade](https://developer.apple.com/videos/play/wwdc2021/10022/) e [fluxo de dados](https://developer.apple.com/videos/play/wwdc2020/10040/).

## Vantagens

Em interfaces que acompanham um modelo, composição declarativa pode reduzir sincronização manual entre controles. No planejamento de um cliente nativo fictício para ioteams, separar o domínio da apresentação permite revisar estados sem misturar acesso a Git com renderização.

## Desvantagens

Identidade instável pode reiniciar estado e produzir transições inesperadas. Dependências amplas ou cálculos caros tornam atualizações custosas; entender o ciclo de vida é necessário para diagnosticar esses problemas.

## Casos de uso

Formulários, navegação e listas em aplicações Apple. Exemplo fictício: uma lista de tarefas usa IDs do domínio para preservar a seleção ao atualizar dados. Este catálogo não afirma que exista um cliente SwiftUI implementado no projeto.

## Restrições

APIs variam com SDK e sistema alvo; a adoção precisa verificar disponibilidade. Estado em memória não substitui persistência durável. O `body` deve descrever a UI sem efeitos ou trabalho bloqueante, conforme [Data Essentials](https://developer.apple.com/videos/play/wwdc2020/10040/). O framework não autoriza operações externas.

## Boas práticas

Definir quem possui cada fonte de verdade, preservar identidade estável e manter views pequenas. Para demandas ioteams, medir atualizações lentas antes de otimizar e conferir erros, estado vazio, cancelamento e restauração. Testar a experiência com [VoiceOver](../voiceover/descricao.md), além dos checks automatizados em [XCTest](../xctest/descricao.md).

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [Demystify SwiftUI, WWDC21](https://developer.apple.com/videos/play/wwdc2021/10022/) e [Data Essentials in SwiftUI, WWDC20](https://developer.apple.com/videos/play/wwdc2020/10040/). São fundamentos históricos; APIs novas exigem consulta ao SDK alvo.

Contexto: [Swift](../swift/descricao.md), [Desenvolvimento de Sistemas](../../profissoes/desenvolvimento-de-sistemas/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
