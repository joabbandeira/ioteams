import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, relative, resolve } from 'node:path'
import { marked, type Token } from 'marked'
import { CatalogSchema, ScrumRoleSchema } from '@ioteams/core'
import { listCorpusMarkdown, loadCatalog, parseFrontmatter, readMarkdown } from '@ioteams/catalog'
import { checkDocumentation } from '../../scripts/docs-check.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
// This slice stays valid when subsequent tasks add other professions/stacks/people.
const professions = [
  { id: 'metodologia-agil-scrum', groups: ['papeis', 'eventos', 'artefatos', 'referencias'] },
  { id: 'desenvolvimento-de-sistemas', groups: ['disciplinas', 'ciclos', 'artefatos', 'referencias'] },
]
const inSlice = (path: string) => professions.some(({ id }) => path.startsWith(`profissoes/${id}/`))
function links(tokens: Token[]): string[] {
  const result: string[] = []
  marked.walkTokens(tokens, token => { if (token.type === 'link') result.push(token.href) })
  return result
}
function localPath(from: string, href: string) {
  return relative(root, resolve(root, dirname(from), href.split('#', 1)[0]))
}
function section(tokens: Token[], heading: string): Token[] {
  const start = tokens.findIndex(token => token.type === 'heading' && token.depth === 2 && token.text === heading)
  expect(start, `Seção navegável: ${heading}`).toBeGreaterThanOrEqual(0)
  const end = tokens.findIndex((token, index) => index > start && token.type === 'heading' && token.depth <= 2)
  return tokens.slice(start + 1, end < 0 ? undefined : end)
}

it('descobre as duas profissões como entidades válidas e resolve a associação de um profissional', async () => {
  const entries = (await loadCatalog(root)).filter(entry => inSlice(entry.path))
  expect(entries.map(entry => entry.metadata.id).sort()).toEqual(['desenvolvimento-de-sistemas', 'metodologia-agil-scrum'])
  expect(entries.every(entry => entry.metadata.kind === 'profession')).toBe(true)
  const catalog = CatalogSchema.parse([...entries.map(entry => entry.metadata), {
    version: 1, kind: 'professional', id: 'fixture-t02', name: 'Fixture T02', fictitious: true,
    professionIds: ['metodologia-agil-scrum', 'desenvolvimento-de-sistemas'], stackIds: [],
  }])
  expect(catalog.find(entry => entry.kind === 'professional')?.professionIds).toHaveLength(2)
})

it.each(professions)('$id oferece navegação entre descrição, agrupamentos explicativos e fontes primárias', async ({ id, groups }) => {
  const base = `profissoes/${id}/`
  const description = `${base}descricao.md`
  const documents = (await listCorpusMarkdown(root)).filter(path => path.startsWith(base))
  const indexLinks = links(marked.lexer(parseFrontmatter(await readMarkdown(root, description)).body))
    .filter(href => !/^[a-z]+:/i.test(href)).map(href => localPath(description, href))
  for (const group of groups) {
    const content = documents.filter(path => path.startsWith(`${base}${group}/`))
    expect(content.length, `${id}/${group} possui conteúdo`).toBeGreaterThan(0)
    expect(content.some(path => indexLinks.includes(path)), `Descrição permite encontrar ${group}`).toBe(true)
    for (const path of content) {
      const tokens = marked.lexer(await readMarkdown(root, path))
      expect(tokens.some(token => token.type === 'heading')).toBe(true)
      expect(tokens.some(token => token.type === 'paragraph')).toBe(true)
      const hrefs = links(tokens)
      expect(hrefs.some(href => !/^[a-z]+:/i.test(href) && localPath(path, href) === description), `Retorno: ${path}`).toBe(true)
      expect(hrefs.some(href => {
        if (!href.startsWith('https://')) return false
        return ['scrumguides.org', 'www.scrum.org', 'www.w3.org', 'spec.openapis.org', 'www.sqlite.org',
          'playwright.dev', 'martinfowler.com'].includes(new URL(href).hostname)
      }), `Fonte primária: ${path}`).toBe(true)
    }
  }
})

it('mantém responsabilidades Scrum separadas e ligadas aos seus objetos de colaboração', async () => {
  const path = 'profissoes/metodologia-agil-scrum/papeis/responsabilidades.md'
  const tokens = marked.lexer(await readMarkdown(root, path))
  const responsibilities = [
    { role: 'Product Owner', heading: 'Product Owner', destination: '../artefatos/compromissos.md#product-backlog' },
    { role: 'Scrum Master', heading: 'Scrum Master', destination: '../eventos/cadencia.md#sprint-retrospective' },
    { role: 'Developer', heading: 'Developers', destination: '../artefatos/compromissos.md#sprint-backlog' },
  ]
  expect(responsibilities.map(item => ScrumRoleSchema.parse(item.role))).toEqual(ScrumRoleSchema.options)
  const references = responsibilities.map(item => links(section(tokens, item.heading)))
  for (const [index, item] of responsibilities.entries()) expect(references[index]).toContain(item.destination)
  // Swapping the PO/SM/Developers sections must break the responsibility mapping.
  expect(references[0]).not.toContain(responsibilities[2].destination)
  expect(references[1]).not.toContain(responsibilities[0].destination)
  expect(references[2]).toContain('../artefatos/compromissos.md#incremento')
})

it('não publica links locais ou âncoras quebradas nesta parcela do corpus', async () => {
  const result = await checkDocumentation(root)
  expect(result.errors.filter(error => inSlice(error.split(': ', 1)[0]) || error.startsWith('Catálogo:'))).toEqual([])
})
