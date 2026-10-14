import { afterEach, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const repo = fileURLToPath(new URL('../..', import.meta.url))
const temporary: string[] = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
it('build padrão gera prévia isolada e preserva o HTML aprovado', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ioteams-t01-build-')); temporary.push(root)
  await mkdir(join(root, 'painel'))
  await mkdir(join(root, 'docs'))
  await cp(join(repo, '.gitignore'), join(root, '.gitignore'))
  await cp(join(repo, 'painel/src'), join(root, 'painel/src'), { recursive: true })
  for (const name of ['build.mjs', 'tsconfig.json', 'package.json']) await cp(join(repo, 'painel', name), join(root, 'painel', name))
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'))
  const approved = '<!doctype html><title>Demo aprovado</title>'
  await writeFile(join(root, 'docs/index.html'), approved)
  await exec(process.execPath, ['painel/build.mjs'], { cwd: root })
  expect(await readFile(join(root, 'docs/index.html'), 'utf8')).toBe(approved)
  const preview = await readFile(join(root, 'painel/dist/index.html'), 'utf8')
  expect(preview.includes('<title>ioteams · Painel local</title>')).toBe(true)
  expect(preview.includes('/api/v1/session/browser')).toBe(true)
  expect(preview).toContain('<div id="root"></div>')
  await exec(process.execPath, ['painel/build.mjs', '--demo'], { cwd: root })
  const demo = await readFile(join(root, 'docs/index.html'), 'utf8')
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  expect(hash(demo)).not.toBe(hash(preview))
  expect(demo.includes('<title>LISA · Demonstração fictícia</title>')).toBe(true)
  expect(demo.includes('/api/v1/')).toBe(false)
  expect(demo.includes('browser-access.html')).toBe(false)
  expect(await readFile(join(root, 'painel/dist/index.html'), 'utf8')).toBe(preview)
}, 30_000)
it('subconjunto vazio retorna indisponível, com saída não zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ioteams-t01-runner-')); temporary.push(root)
  await mkdir(join(root, 'scripts'))
  await writeFile(join(root, 'scripts/test.mjs'), await readFile(join(repo, 'scripts/test.mjs')))
  await writeFile(join(root, 'scripts/test-runner.ts'), await readFile(join(repo, 'scripts/test-runner.ts')))
  const result = await exec(process.execPath, ['scripts/test.mjs', 'integration'], { cwd: root }).then(
    r => ({ code: 0, output: r.stdout + r.stderr }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, output: e.stdout + e.stderr }),
  )
  expect(result.code).toBe(2)
  expect(result.output).toMatch(/indisponível/i)
  expect(result.output).not.toMatch(/passed/i)
})
