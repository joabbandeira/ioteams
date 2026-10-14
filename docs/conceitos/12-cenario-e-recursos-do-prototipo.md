# 12 — Cenário e recursos do protótipo

[Visão geral do projeto](../../README.md)

O protótipo local usa o produto fictício **Trilha iOS** e a equipe **LISA** para tornar a ideia observável. Pessoas, tarefas, datas e situações são exemplos, sem representar uma operação real ou resultados de agentes autônomos.

## Produto e objetivos

- **Produto:** Trilha iOS, um aplicativo para organizar compromissos e rotina.
- **Product Goal:** ajudar pessoas a organizar a rotina e acompanhar seus compromissos em um app iOS simples e confiável.
- **Sprint ativa:** Sprint 04, de 12 a 23 de outubro de 2026, no cenário fictício.
- **Sprint Goal:** criar e sincronizar um compromisso, com uma experiência acessível e qualidade verificada.

As datas compõem uma fotografia de demonstração. Não constituem um calendário atualizado automaticamente ou um compromisso de entrega real.

## Integrantes de LISA

| Profissional fictício | Especialidade ou função | Responsabilidade Scrum |
| --- | --- | --- |
| Helena Costa | Produto | Product Owner |
| Marcos Lima | Facilitação e efetividade | Scrum Master |
| Bia Martins | Desenvolvimento iOS | Developer |
| Caio Alves | Desenvolvimento iOS | Developer |
| Duda Rocha | Qualidade e testes | Developer |
| Ravi Melo | Qualidade e testes | Developer |
| Nara Dias | Banco de dados | Developer |
| Ivo Santos | Infraestrutura | Developer |

Os oito integrantes formam uma equipe integrada. A composição deixa visível que Developers incluem os seis profissionais de execução, abrangendo programação e outras especialidades necessárias à entrega.

## Etapas e tarefas do cenário

As etapas são **Fundação**, **Agenda e lembretes** e **Qualidade e entrega**. O estado inicial distribui tarefas entre os sete estados do quadro:

| Estado inicial | Tarefas ilustrativas |
| --- | --- |
| `TODO` | Explorar lembretes recorrentes. |
| `IN PLANNING` | Mapear estados vazios da agenda. |
| `READY` | Validar acessibilidade com VoiceOver; cobrir criação e edição com testes. |
| `BLOCKED` | Liberar ambiente de homologação, aguardando acesso. |
| `IN PROGRESS` | Criar fluxo de novo compromisso; sincronizar agenda em background. |
| `REJECTED` | Corrigir migração do banco local, com falha de duplicação identificada. |
| `DONE` | Definir esquema de compromissos; configurar pipeline iOS; preparar a base em SwiftUI. |

A distribuição demonstra trabalho técnico, qualidade, integração e dependências. Os cartões concluídos são dados fictícios, não evidências de que esses trabalhos foram executados.

## Recursos demonstrados

| Recurso | Finalidade |
| --- | --- |
| Painel em três colunas | Relacionar equipe, cadência e entrega. |
| Detalhes dos integrantes | Explicar suas contribuições e responsabilidades Scrum. |
| Detalhes dos eventos | Explicar finalidade, participação e cadência. |
| Criação de tarefas | Adicionar trabalho em `TODO`, associado a um dos Developers. |
| Movimentação de tarefas | Explorar as transições, motivos e verificações do quadro. |
| Busca e filtros por profissional e etapa | Localizar o trabalho relevante. |
| Navegação pelas colunas do quadro | Consultar estados em áreas de visualização menores. |
| Indicadores e pontos | Acompanhar a composição do cenário e sua evolução simulada. |
| Histórico e desfazer | Examinar ações e retornar a um estado anterior da exploração. |
| Reiniciar cenário | Restaurar os dados iniciais da demonstração. |
| Edição exploratória dos objetivos | Observar a apresentação de Product Goal e Sprint Goal. |
| Temas claro e escuro | Adaptar a leitura à preferência visual. |
| Layout responsivo e controles por teclado | Apoiar exploração em diferentes dimensões e formas de navegação. |

## Limites da demonstração

Os dados são mantidos em memória na página. Recarregá-la restaura o cenário inicial; alterações e preferência de tema não constituem dados persistentes.

O painel não executa agentes, não consulta um RAG, não conecta ferramentas de desenvolvimento e não implementa permissões de backend. Seus controles simulam a dinâmica que ajudou a discutir o projeto.

Esta publicação contém a documentação conceitual. O código e a execução do protótipo local não fazem parte desta entrega ao repositório. O painel é uma referência de interação, enquanto a arquitetura futura está no [conceito 13](13-direcao-futura-e-acoplamento.md).
