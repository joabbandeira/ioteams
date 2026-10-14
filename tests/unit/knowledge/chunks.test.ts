import { expect, it } from 'vitest'
import { splitMarkdown } from '../../../packages/knowledge/src/chunks.js'
import { lexicalQuery } from '../../../packages/knowledge/src/query.js'

it('preserva linhas originais, headings e conteúdo literal sem indexar frontmatter', () => {
  const source = '---\nversion: 1\nkind: stack\nid: git\nname: Git\n---\n# Git\nIntrodução.\n\n## Segurança\nConteúdo literal.\n```sh\n# Isto é código, não heading\n$(touch /tmp/never)\n```\n'
  expect(splitMarkdown(source)).toEqual([
    { heading: 'Git', lineStart: 7, lineEnd: 9, excerpt: '# Git\nIntrodução.\n' },
    { heading: 'Git > Segurança', lineStart: 10, lineEnd: 15, excerpt: '## Segurança\nConteúdo literal.\n```sh\n# Isto é código, não heading\n$(touch /tmp/never)\n```' },
  ])
})
it('divide seções extensas por linhas, sem truncar citações ou exceder limite', () => {
  const chunks = splitMarkdown('# Guia\n' + 'Detalhe '.repeat(20) + '\n' + 'Mais '.repeat(20) + '\n', 180)
  expect(chunks).toHaveLength(2)
  expect(chunks.map(c => [c.lineStart, c.lineEnd])).toEqual([[1, 2], [3, 3]])
  expect(chunks.every(c => c.excerpt.length <= 180)).toBe(true)
  expect(chunks[1].heading).toBe('Guia')
  expect(() => splitMarkdown('x'.repeat(4097))).toThrow(/linha/i)
  expect(splitMarkdown(' \n\n')).toEqual([])
})
it('suporta headings setext, CRLF e limites de heading', () => {
  expect(splitMarkdown('Título\r\n======\r\nAção.\r\n')).toEqual([
    { heading: 'Título', lineStart: 1, lineEnd: 3, excerpt: 'Título\r\n======\r\nAção.\r' },
  ])
  expect(() => splitMarkdown('# ' + 'a'.repeat(1025))).toThrow(/heading/i)
})
it('transforma texto em termos Unicode literais e nunca permite sintaxe FTS livre', () => {
  expect(lexicalQuery('AÇÃO cafe\u0301 SQLite')).toBe('"acao" AND "cafe" AND "sqlite"')
  expect(lexicalQuery('" OR * NEAR(test) -x; DROP TABLE docs; --')).toBe('"or" AND "near" AND "test" AND "x" AND "drop" AND "table" AND "docs"')
  expect(lexicalQuery('😀 * : "')).toBeNull()
  expect(lexicalQuery('ação AÇÃO')).toBe('"acao"')
})

it('não converte fechamento de fence seguido de thematic break em heading setext', () => {
  expect(splitMarkdown('# Guia\n```text\nDado literal.\n```\n---\nFim.\n')).toEqual([
    { heading: 'Guia', lineStart: 1, lineEnd: 6, excerpt: '# Guia\n```text\nDado literal.\n```\n---\nFim.' },
  ])
})
