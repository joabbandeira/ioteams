import type { KnowledgeIndex } from '@ioteams/knowledge'
import type { KnowledgeCitation } from '@ioteams/core'
// Narrow read-only bridge: T09 exposes no public corpus-identity accessor. Keep
// this dependency here until an accessor can be added in a later authorized slice.
import { connection } from '../../knowledge/src/database.js'
import { readMarkdown } from '@ioteams/catalog'
import { canonicalAbsolute } from './paths.js'
import { gitCommand } from './git.js'
import { sha256 } from './policy.js'
import { fail } from './errors.js'
export function recoveryQuery(goal: string): string {
  const normalized = goal.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').toLowerCase()
  const terms = [...new Set(normalized.match(/[\p{L}\p{N}_]+/gu) ?? [])].filter(term => term.length <= 128)
  const selected: string[] = []; let length = 0
  for (const term of terms) {
    if (selected.length === 32 || length + term.length + (selected.length ? 1 : 0) > 2048) break
    selected.push(term); length += term.length + (selected.length > 1 ? 1 : 0)
  }
  return selected.join(' ')
}
/** Check BEFORE search, which otherwise reads sources from its bound root. */
export async function assertKnowledgeBinding(index: KnowledgeIndex, root: string): Promise<void> {
  await canonicalAbsolute(root)
  if (connection(index).database.prepare("SELECT value FROM metadata WHERE key = 'corpusRoot'").get()?.value !== root)
    fail('NO_EVIDENCE', 'Índice não está vinculado ao corpus autorizado.')
}
export async function verifyCitation(root: string, citation: KnowledgeCitation): Promise<void> {
  try {
    await canonicalAbsolute(root)
    if ((await gitCommand(root, ['rev-parse', '--show-toplevel'])).trim() !== root ||
      (await gitCommand(root, ['rev-parse', '--verify', `${citation.commitSha}^{commit}`])).trim() !== citation.commitSha)
      fail('NO_EVIDENCE', 'Revisão da citação não existe no corpus autorizado.')
    const source = await readMarkdown(root, citation.path)
    const entry = (await gitCommand(root, ['ls-tree', '-z', citation.commitSha, '--', `:(literal)${citation.path}`])).split('\0').filter(Boolean)
    if (entry.length !== 1 || !/^100(?:644|755) blob [a-f0-9]+\t/.test(entry[0]) || entry[0].split('\t')[1] !== citation.path)
      fail('NO_EVIDENCE', 'Citação não corresponde a blob regular da revisão.')
    const blob = await gitCommand(root, ['cat-file', 'blob', entry[0].split(' ')[2].split('\t')[0]])
    if (sha256(source) !== citation.contentHash || sha256(blob) !== citation.contentHash ||
      source.split('\n').slice(citation.lineStart - 1, citation.lineEnd).join('\n') !== citation.excerpt)
      fail('NO_EVIDENCE', 'Citação e revisão não correspondem ao conteúdo autorizado.')
  } catch { fail('NO_EVIDENCE', 'Citação não verificável no corpus autorizado.') }
}
