import { expect, it } from 'vitest'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked, type Token, type Tokens } from 'marked'
import { CatalogSchema } from '@ioteams/core'
import { listCorpusMarkdown, loadCatalog, parseFrontmatter, readMarkdown } from '@ioteams/catalog'
import { checkDocumentation } from '../../scripts/docs-check.js'

const root = fileURLToPath(new URL('../..', import.meta.url))
// Only this initial seed fixes these totals. Future entities can coexist outside these IDs.
const seed = {
  profession: ['metodologia-agil-scrum', 'desenvolvimento-de-sistemas', 'devops',
    'engenharia-de-software', 'engenharia-de-ia-aplicada', 'engenharia-de-ia-generativa'],
  stack: ['scrum', 'git', 'typescript', 'react', 'swift', 'swiftui', 'xctest', 'voiceover',
    'sqlite', 'github-actions', 'codex-local', 'rag-local'],
  professional: ['helena-costa', 'marcos-lima', 'bia-martins', 'caio-alves', 'duda-rocha',
    'ravi-melo', 'nara-dias', 'ivo-santos'],
  team: ['lisa'],
}
const members = [
  { professionalId: 'helena-costa', role: 'Product Owner' },
  { professionalId: 'marcos-lima', role: 'Scrum Master' },
  { professionalId: 'bia-martins', role: 'Developer' },
  { professionalId: 'caio-alves', role: 'Developer' },
  { professionalId: 'duda-rocha', role: 'Developer' },
  { professionalId: 'ravi-melo', role: 'Developer' },
  { professionalId: 'nara-dias', role: 'Developer' },
  { professionalId: 'ivo-santos', role: 'Developer' },
]
function links(tokens: Token[]): string[] {
  const result: string[] = []
  marked.walkTokens(tokens, token => { if (token.type === 'link') result.push(token.href) })
  return result
}
function localLinks(path: string, tokens: Token[]): string[] {
  return links(tokens).filter(href => !/^[a-z]+:/i.test(href))
    .map(href => posix.normalize(posix.join(posix.dirname(path), href.split('#', 1)[0])))
}

it('carrega o seed completo com seis profissões, doze stacks, oito profissionais e LISA', async () => {
  const entries = (await loadCatalog(root)).filter(({ metadata }) => seed[metadata.kind].includes(metadata.id))
  expect(entries).toHaveLength(27)
  for (const [kind, ids] of Object.entries(seed)) {
    expect(entries.filter(entry => entry.metadata.kind === kind).map(entry => entry.metadata.id).sort())
      .toEqual([...ids].sort())
  }
  // Parse the seed alone: a relation accidentally redirected outside the seed must fail.
  const catalog = CatalogSchema.parse(entries.map(entry => entry.metadata))
  for (const profile of catalog.filter(entry => entry.kind === 'professional')) {
    expect(profile.fictitious).toBe(true)
    expect(profile.professionIds.length).toBeGreaterThan(0)
    expect(profile.stackIds.length).toBeGreaterThan(0)
  }
})

it.each(seed.professional)('%s tem os quatro documentos navegáveis, referências e competências resolvidas', async id => {
  const base = `profissionais/${id}/`
  const profilePath = `${base}perfil.md`
  const profile = parseFrontmatter(await readMarkdown(root, profilePath))
  expect(profile.metadata?.kind).toBe('professional')
  if (profile.metadata?.kind !== 'professional') throw new Error('Perfil profissional ausente')
  const documents = (await listCorpusMarkdown(root)).filter(path => path.startsWith(base))
  const references = documents.filter(path => path.startsWith(`${base}referencias/`))
  expect(references.length).toBeGreaterThan(0)
  const navigation = localLinks(profilePath, marked.lexer(profile.body))
  for (const filename of ['personalidade.md', 'conhecimentos.md', 'curriculo.md']) {
    const path = `${base}${filename}`
    expect(documents).toContain(path)
    expect(navigation).toContain(path)
    const content = parseFrontmatter(await readMarkdown(root, path))
    expect(content.metadata).toBeNull()
    const tokens = marked.lexer(content.body)
    expect(tokens.some(token => token.type === 'heading' && token.depth === 1)).toBe(true)
    expect(tokens.some(token => token.type === 'paragraph')).toBe(true)
    expect(localLinks(path, tokens)).toContain(profilePath)
  }
  for (const reference of references) {
    expect(navigation).toContain(reference)
    const tokens = marked.lexer(await readMarkdown(root, reference))
    expect(localLinks(reference, tokens)).toContain(profilePath)
    expect(links(tokens).some(href => href.startsWith('https://'))).toBe(true)
  }
  const professions = localLinks(profilePath, marked.lexer(profile.body))
  for (const professionId of profile.metadata.professionIds)
    expect(professions).toContain(`profissoes/${professionId}/descricao.md`)
  const knowledgePath = `${base}conhecimentos.md`
  const knowledge = localLinks(knowledgePath, marked.lexer(await readMarkdown(root, knowledgePath)))
  expect(knowledge.filter(path => path.startsWith('stacks/')).sort())
    .toEqual(profile.metadata.stackIds.map(stackId => `stacks/${stackId}/descricao.md`).sort())
})

it('LISA resolve os oito membros tipados e mantém sua lista legível consistente com os metadados', async () => {
  const team = (await loadCatalog(root)).find(entry => entry.metadata.kind === 'team' && entry.metadata.id === 'lisa')
  expect(team?.metadata.kind).toBe('team')
  if (team?.metadata.kind !== 'team') throw new Error('LISA ausente')
  expect(team.metadata.members).toEqual(members)
  const tokens = marked.lexer(await readMarkdown(root, 'equipes/lisa/integrantes.md'))
  const table = tokens.find(token => token.type === 'table') as Tokens.Table | undefined
  expect(table).toBeDefined()
  const readableMembers = table!.rows.map(row => {
    const href = links(row[0].tokens)[0]
    return { professionalId: posix.basename(posix.dirname(href)), role: row[2].text }
  })
  expect(readableMembers).toEqual(members)
})

it('LISA oferece documentos separados de integrantes, responsabilidades e interfaces', async () => {
  const path = 'equipes/lisa/descricao.md'
  const navigation = localLinks(path, marked.lexer(parseFrontmatter(await readMarkdown(root, path)).body))
  const bodies: string[] = []
  for (const filename of ['integrantes.md', 'responsabilidades.md', 'interfaces.md']) {
    const target = `equipes/lisa/${filename}`
    expect(navigation).toContain(target)
    const document = parseFrontmatter(await readMarkdown(root, target))
    expect(document.metadata).toBeNull()
    expect(localLinks(target, marked.lexer(document.body))).toContain(path)
    bodies.push(document.body)
  }
  expect(new Set(bodies).size).toBe(3)
})

it('resolve links e âncoras dos profissionais e de LISA sem erros de catálogo', async () => {
  const result = await checkDocumentation(root)
  const inSlice = (path: string) => seed.professional.some(id => path.startsWith(`profissionais/${id}/`))
    || path.startsWith('equipes/lisa/')
  expect(result.errors.filter(error => inSlice(error.split(': ', 1)[0]) || error.startsWith('Catálogo:'))).toEqual([])
})
