---
version: 1
kind: stack
id: sqlite
name: SQLite
---
# SQLite

## Propósito

Persistir e consultar dados relacionais junto à aplicação, sem um servidor de banco separado. A [orientação de uso do SQLite](https://www.sqlite.org/whentouse.html) destaca armazenamento local para aplicações e dispositivos.

## Funcionalidades

Organizar tabelas, consultas e transações; aplicar índices e manter dados em armazenamento local. A extensão [FTS5](https://www.sqlite.org/fts5.html) acrescenta busca textual, tokenizadores e funções de ranking e trechos. A disponibilidade dessa extensão deve ser verificada no runtime escolhido.

## Vantagens

Para uma aplicação local de usuário único, reduz componentes de operação e simplifica distribuição. No desenho do ioteams, bancos separados para estado operacional e índice permitem reconstruir a busca sem tratar histórico de execução como conteúdo descartável.

## Desvantagens

Contenção de escrita, migrações e crescimento do arquivo ainda precisam de planejamento. Consultas sem índices adequados podem prejudicar a resposta da aplicação. Facilidade de criar um banco não elimina a necessidade de testar recuperação e backup.

## Casos de uso

Estado de ferramentas desktop, catálogos e índices textuais locais. Exemplo fictício: persistir tentativas de uma tarefa em um banco próprio e indexar descrições públicas em outro, com ciclos de retenção diferentes. Esta stack descreve capacidade; não afirma a implementação desses serviços nesta parcela.

## Restrições

Há um escritor por vez por banco. Acesso direto simultâneo por muitas máquinas em filesystem de rede pode ter problemas de latência e locks; cargas com muita concorrência podem exigir arquitetura cliente/servidor. [Limites de adoção](https://www.sqlite.org/whentouse.html). Banco local não significa criptografia ou controle de acesso automático. O catálogo não concede acesso a bancos ativos de outros aplicativos.

## Boas práticas

Para o ioteams, usar parâmetros nas consultas, transações curtas e migrações rastreáveis. Validar restauração com bancos descartáveis pertencentes ao teste. Manter bancos, WAL, SHM e locks operacionais fora do corpus e do Git; não remover arquivos auxiliares de um banco em uso para corrigir contenção.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [Appropriate Uses For SQLite](https://www.sqlite.org/whentouse.html) e [SQLite FTS5 Extension](https://www.sqlite.org/fts5.html).

Contexto: [RAG local](../rag-local/descricao.md), [Engenharia de Software](../../profissoes/engenharia-de-software/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
