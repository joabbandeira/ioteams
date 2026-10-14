import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDocumentation } from '../../scripts/docs-check.js'

let root: string
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t01-docs-'))) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
it('verifica links relativos, referências, diretórios e âncoras Unicode; ignora exemplos de código', async () => {
  await mkdir(join(root, 'docs'))
  await writeFile(join(root, 'README.md'), '# Início\n[Guia][ref]\n[Diretório](docs/)\n\n[ref]: docs/guia.md#instalação-1\n\n```md\n[Falso](inexistente.md)\n```')
  await writeFile(join(root, 'docs/guia.md'), '# Instalação\n# Instalação\n[Voltar](../README.md#início)\n[Web](https://example.test/sem-rede)')
  expect(await checkDocumentation(root)).toEqual({ documents: 2, entities: 0, errors: [] })
})
it('falha para links locais e âncoras ausentes, traversal e links perigosos', async () => {
  await writeFile(join(root, 'README.md'), '# Início\n[X](missing.md)\n[X](#inexistente)\n[X](../escape.md)\n[X](javascript:alert)')
  const result = await checkDocumentation(root)
  expect(result.errors).toHaveLength(4)
  expect(result.errors.every(error => error.includes('README.md'))).toBe(true)
})
it('não segue symlinks nem inclui dependências ou artefatos', async () => {
  await mkdir(join(root, 'node_modules'))
  await writeFile(join(root, 'node_modules/README.md'), '[X](missing.md)')
  await writeFile(join(root, 'README.md'), '[X](linked.md)')
  await symlink(join(root, 'node_modules/README.md'), join(root, 'linked.md'))
  const result = await checkDocumentation(root)
  expect(result.documents).toBe(1)
  expect(result.errors.some(error => /symlink/i.test(error))).toBe(true)
})
it('inclui validação estrutural do catálogo presente', async () => {
  await mkdir(join(root, 'stacks/git'), { recursive: true })
  await writeFile(join(root, 'stacks/git/descricao.md'), '# Sem metadados')
  const result = await checkDocumentation(root)
  expect(result.errors.some(error => /metadados/i.test(error))).toBe(true)
})
