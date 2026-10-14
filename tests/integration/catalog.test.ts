import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadCatalog, listCorpusMarkdown, readMarkdown } from '@ioteams/catalog'
import { metadata } from '../fixtures/contracts.js'

let root: string
let external: string
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t01-catalog-')))
  external = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t01-outside-')))
})
afterEach(async () => { await rm(root, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }) })
async function file(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}
async function catalog() {
  for (const data of metadata) {
    const folder = ({ profession: 'profissoes', stack: 'stacks', professional: 'profissionais', team: 'equipes' } as Record<string, string>)[data.kind]
    const name = data.kind === 'professional' ? 'perfil.md' : 'descricao.md'
    await file(`${folder}/${data.id}/${name}`, `---\n${JSON.stringify(data)}\n---\n# ${data.name}\nTexto declarativo.`)
  }
}
it('permite catálogo vazio e resolve as relações de um catálogo presente', async () => {
  expect(await loadCatalog(root)).toEqual([])
  await catalog()
  const entries = await loadCatalog(root)
  expect(entries).toHaveLength(6)
  expect(entries.find(e => e.metadata.id === 'lisa')?.path).toBe('equipes/lisa/descricao.md')
})
it('recusa referências quebradas e identidade diferente do diretório', async () => {
  await catalog()
  await rm(join(root, 'stacks/git'), { recursive: true })
  await expect(loadCatalog(root)).rejects.toThrow()
  await file('stacks/git/descricao.md', '---\nversion: 1\nkind: stack\nid: other\nname: Other\n---\n')
  await expect(loadCatalog(root)).rejects.toThrow(/identidade/i)
})
it('exige metadados em entidades existentes', async () => {
  await file('profissionais/bia/perfil.md', '# Bia sem metadados')
  await expect(loadCatalog(root)).rejects.toThrow(/metadados/i)
})
it('não atravessa symlink em arquivo, diretório nem raiz', async () => {
  await writeFile(join(external, 'outside.md'), 'EXTERNAL')
  await file('stacks/git/descricao.md', '# Seguro')
  await symlink(join(external, 'outside.md'), join(root, 'stacks/git/link.md'))
  await expect(readMarkdown(root, 'stacks/git/link.md')).rejects.toThrow(/symlink/i)
  await symlink(external, join(root, 'stacks/external'))
  await expect(readMarkdown(root, 'stacks/external/outside.md')).rejects.toThrow(/symlink/i)
  await expect(listCorpusMarkdown(root)).rejects.toThrow(/symlink/i)
  await symlink(external, join(root, 'linked-root'))
  await expect(loadCatalog(join(root, 'linked-root'))).rejects.toThrow(/symlink/i)
})
it('recusa traversal, não Markdown e arquivos grandes', async () => {
  await expect(readMarkdown(root, '../outside.md')).rejects.toThrow()
  await expect(readMarkdown(root, '/outside.md')).rejects.toThrow()
  await file('stacks/git/data.json', '{}')
  await expect(readMarkdown(root, 'stacks/git/data.json')).rejects.toThrow()
  await file('stacks/git/big.md', 'x'.repeat(1_048_577))
  await expect(readMarkdown(root, 'stacks/git/big.md')).rejects.toThrow(/limite/i)
})
it('seleciona somente Markdown do corpus e exclui instruções, configurações e runtime', async () => {
  for (const path of ['stacks/git/descricao.md', 'stacks/git/uso.md', 'stacks/git/AGENTS.md', 'stacks/git/SKILL.md',
    'stacks/git/.codex/config.md', 'docs/private.md', 'stacks/git/config.json', 'stacks/git/runtime/log.md',
    'stacks/git/node_modules/module.md']) await file(path, '# Dado')
  expect(await listCorpusMarkdown(root)).toEqual(['stacks/git/descricao.md', 'stacks/git/uso.md'])
  expect(await readMarkdown(root, 'stacks/git/uso.md')).toBe('# Dado')
})
