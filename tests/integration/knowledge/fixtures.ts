import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { metadata } from '../../fixtures/contracts.js'

export async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t09-corpus-')))
  const data = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t09-index-')))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'T09 Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'T09 Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' },
  }).trim()
  const file = async (path: string, content: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  const commit = () => { git('add', '--all'); git('commit', '--allow-empty', '-qm', 'Fixture snapshot'); return git('rev-parse', 'HEAD') }
  git('init', '-q')
  for (const entry of metadata) {
    const folder = ({ profession: 'profissoes', stack: 'stacks', professional: 'profissionais', team: 'equipes' } as Record<string, string>)[entry.kind]
    await file(`${folder}/${entry.id}/${entry.kind === 'professional' ? 'perfil' : 'descricao'}.md`,
      `---\n${JSON.stringify(entry)}\n---\n# ${entry.name}\nConhecimento de referência.\n`)
  }
  const path = 'stacks/git/uso.md'
  const source = '# Git\nIntrodução.\n\n## Recuperação\nAção e café: SQLite para recuperação lexical.\nFonte: [SQLite](https://www.sqlite.org/fts5.html).\n'
  await file(path, source)
  const sha = commit()
  return { root, data, file, git, commit, path, source, sha, cleanup: async () => {
    await rm(root, { recursive: true, force: true }); await rm(data, { recursive: true, force: true })
  } }
}
