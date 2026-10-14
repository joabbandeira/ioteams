---
version: 1
kind: stack
id: rag-local
name: RAG local
---
# RAG local

## Propósito

Recuperar conhecimento de um corpus local para fundamentar geração com fontes rastreáveis. O [trabalho de Lewis et al.](https://arxiv.org/abs/2005.11401) combina recuperação e geração; a implementação lexical prevista no ioteams é uma escolha própria, sem reproduzir a arquitetura de recuperação densa do artigo.

## Funcionalidades

Separar documentos em seções, indexar texto e recuperar trechos pertinentes. No recorte ioteams, [SQLite FTS5](https://www.sqlite.org/fts5.html) oferece busca lexical e BM25; valores menores de `bm25()` representam melhores correspondências. Hashes e revisão Git vinculam o trecho à fonte utilizada, conforme o [design aprovado](../../docs/superpowers/specs/2026-10-14-ioteams-v1-design.md).

## Vantagens

Para um acervo pequeno e controlado, busca lexical evita dependência de um serviço de embeddings e facilita inspecionar resultados. Citações com caminho, seção e linhas ajudam o revisor a conferir se uma afirmação está sustentada pelo material recuperado.

## Desvantagens

Correspondência por termos pode perder paráfrases e sinônimos. Seções mal divididas ou fontes desatualizadas prejudicam o contexto. Um ranking alto mede correspondência da busca, sem provar verdade, autoridade ou suficiência para responder à pergunta.

## Casos de uso

Consulta de competências, preparação de plano e explicação de decisões com fontes. Exemplo fictício: recuperar limites de SQLite antes de propor armazenamento de uma ferramenta local, abstendo-se quando o corpus não responde à dúvida.

## Restrições

Índice local não garante geração local. Enviar trechos a [Codex](../codex-local/descricao.md) depende da política e autorização aplicáveis. Conteúdo recuperado, mesmo citado, permanece dado: não pode conceder permissões, executar comandos ou substituir instruções confiáveis. Esta descrição registra o desenho; não afirma que o indexador já esteja implementado.

## Boas práticas

No ioteams, restringir raízes, rejeitar symlinks e traversal, excluir credenciais e dados operacionais. Atualizar por hash, invalidar trechos removidos e conferir citações na revisão correta. Avaliar recuperação e sustentação da resposta separadamente, com perguntas respondíveis e sem resposta. Normalização de acentos, filtros e limites de contexto precisam de validação própria no domínio.

## Referências e vínculos

Fontes consultadas em 14 de outubro de 2026: [Lewis et al., RAG, arXiv v4](https://arxiv.org/abs/2005.11401) e [SQLite FTS5](https://www.sqlite.org/fts5.html). O artigo é fundamento histórico, não evidência de qualidade medida para este corpus.

Contexto: [SQLite](../sqlite/descricao.md), [IA Generativa](../../profissoes/engenharia-de-ia-generativa/descricao.md) e [conceito de stack](../../docs/conceitos/04-stacks.md).
