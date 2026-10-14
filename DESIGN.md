---
version: alpha
name: ioteams
description: Painel local de pessoas, conhecimento, planejamento e entrega com a identidade visual LISA.
colors:
  primary: "#6c55ca"
  background: "#ffffff"
  canvas: "#f4f6fb"
  foreground: "#25304a"
  muted: "#68748a"
  danger: "#b33457"
  dark-primary: "#b39af5"
  dark-background: "#1a1f2d"
typography:
  display:
    fontFamily: '"Avenir Next", -apple-system, sans-serif'
  sans:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, monospace'
rounded:
  DEFAULT: "8px"
  lg: "12px"
spacing:
  section-gap: "20px"
  shell-gap: "28px"
components:
  button: {}
  card: {}
  dialog: {}
  select: {}
  notice: {}
---

# ioteams Design System

## Overview

### Creative North Star

Uma sala de trabalho da equipe: pessoas, cadência e entrega permanecem legíveis lado a lado. O quadro LISA existente é a referência visual; violeta suave, superfícies claras e tipografia de sistema sustentam a densidade operacional. O gesto característico é tornar visível a relação entre identidade, responsabilidade Scrum e competência, ao lado da entrega verificável por hash.

### Product context and register

Produto local para um operador de desenvolvimento em macOS, com painel no navegador. Registro de aplicação, idioma pt-BR. O escopo aprovado não estabelece mercado japonês, localização japonesa ou dados específicos do Japão. A rotina envolve configurar demandas e inspecionar fontes/planos, sem promoção comercial ou indicadores inventados.

As superfícies operacionais usam dados da API. `/demo` e o HTML publicado são simulações explicitamente identificadas. Não reestilizar o exemplo para parecer uma execução real. Evitar heróis comerciais, números decorativos e uma identidade visual concorrente.

### Token ownership/runtime mapping

Modelo B: [painel/src/styles.css](painel/src/styles.css) permanece canônico. Este documento espelha os valores aceitos, sem gerar CSS. `:root` e `:root.dark` definem as cores semânticas; `@theme inline` adapta-as ao Tailwind v4; Button/Card/Dialog/Select consomem essas utilidades. As classes `panel-*` consomem as mesmas variáveis. Verificação de drift compara este frontmatter às variáveis CSS e inspeciona os dois temas no E2E.

## Colors

`primary` identifica ações e seleção; `foreground` sustenta o texto; `muted` apresenta contexto. `canvas` separa os painéis brancos. `danger` acompanha erro textual, nunca sozinho. O tema escuro remapeia `--primary` e `--background` para `dark-primary` e `dark-background` sem mudar significado. Os demais valores existentes de sucesso, aviso e superfícies continuam em CSS. Forced colors preserva bordas e cores do sistema.

## Typography

Avenir Next dá caráter a títulos curtos, com fallback local; a pilha sans de sistema atende texto e campos sem downloads ou troca tardia de fontes. Mono identifica SHAs, hashes, caminhos e argv. Corpo operacional 14px/1.7, títulos 19–32px. O demo conserva sua densidade anterior. Identificadores longos quebram linha; nenhum valor técnico depende de tooltip para acesso integral.

## Layout

Shell de até 1480px, navegação lateral de 200px, intervalo de 28px. O conteúdo usa ritmo de 20px. Abaixo de 1050px, pessoas e cadência se empilham; abaixo de 700px, quatro destinos viram navegação superior e formulários usam uma coluna. O documento é o dono do scroll vertical. Só o quadro de sete estados tem overflow horizontal. Formulários não recebem altura fixa de viewport. Listas do catálogo e execuções exibem 20 registros por vez com Mostrar mais.

## Elevation & Depth

Cards brancos com borda e sombra discreta separam trabalho sem competir com o conteúdo. Diálogos Radix usam overlay e portal; menus usam o portal do Select. Texto técnico usa superfície rebaixada. O tema escuro troca superfícies e bordas por tokens, sem acrescentar sombras dramáticas.

## Shapes

Controles e disclosures usam 8px; cards operacionais, 12px. Avatares herdados identificam pessoas. Botões mantêm geometria durante trabalho pendente; o estado busy é anunciado por ARIA e região de status.

## Components

### Foundational visual states

Hover e foco visível pertencem a controles semânticos. Estado selecionado tem rótulo e `aria-current`. Disabled usa semântica nativa, opacidade e motivo textual. Loading usa status em uma região reservada, sem porcentagem fictícia. Erros persistem em Notice e campos; sucesso usa a mesma Notice, sem roubar foco.

### Buttons and actions

Button existente é o dono de ênfase: sólido para ação principal, outline/ghost para secundárias. Controles operacionais têm no mínimo 40px de altura. Decisões de execução e aprovação abrem confirmação com verbo e objeto. Cancelar recebe foco inicial. A ação permanece indisponível enquanto estiver pendente ou incerta.

### Navigation and data display

Quatro links por hash: Trabalho, Conhecimento, Execuções, Configuração. O destino atual é marcado e atualiza o título. Pessoas mostram profissão/stacks separadas de papel Scrum. O quadro operacional lê os estados do serviço sem controles de progressão manual. A cadência distingue sprints reais de registros de eventos ainda não expostos.

### Forms and overlays

FieldSelect reutiliza o Select Radix existente: popup authored com largura do trigger, limite de viewport e teclado padrão. Formulários têm `noValidate`, labels, erro associado e foco no primeiro campo inválido. Textareas têm altura suficiente e `resize:none`. ConfirmAction reutiliza Dialog Radix, foco contido, Escape e restauração. Notice é o feedback operacional canônico; o toast transitório do demo permanece uma variante isolada da simulação.

### Iconography, motion and content

Lucide acompanha rótulos; avatares usam iniciais decorativas. Sem animação ambiente. Movimento existente respeita reduced motion. A voz descreve fatos e próximos passos em português; fontes, lacunas e incerteza não são disfarçadas por cor ou promessas de sucesso.

## Do's and Don'ts

- Preserve tokens e componentes compartilhados ao adicionar vistas.
- Exiba o hash completo e os limites confiáveis junto à aprovação.
- Não transforme fontes de conhecimento em autoridade operacional.
- Não apresente dados fictícios, SSE metadata ou progresso estimado como evidência de execução.
