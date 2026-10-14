import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { canonicalAbsolute, checkoutPath, resolvedRoot } from './paths.js'
import { canonicalJson, sha256, type ApprovedPolicy, type InstructionSource } from './policy.js'
import { fail } from './errors.js'
const excluded = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage'])
function sourceKind(path: string): InstructionSource['kind'] | undefined {
  if (path.split('/').some(part => ['.codex', '.agents', '.claude'].includes(part.toLowerCase())) || /(?:^|\/)(?:\.mcp\.json|CLAUDE\.md|GEMINI\.md|SKILL\.md)$/i.test(path)) return 'configuration'
  if (/(?:^|\/)AGENTS(?:\.override)?\.md$/i.test(path)) return 'instructions'
}
/** Inventory is data only. No file contents are interpreted or loaded as configuration. */
export async function inventoryInstructions(root: string): Promise<InstructionSource[]> {
  await resolvedRoot(root)
  const found: InstructionSource[] = []
  let count = 0
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 64) fail('INVENTORY_LIMIT', 'Árvore de instruções excede o limite de profundidade.')
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++count > 100_000) fail('INVENTORY_LIMIT', 'Árvore de instruções excede o limite de arquivos.')
      if (excluded.has(entry.name)) continue
      const absolute = join(directory, entry.name), path = relative(root, absolute).split('\\').join('/')
      const kind = sourceKind(path)
      // Never follow symlinks, even to instruction directories. Ambiguous aliases block loading.
      if (entry.isSymbolicLink()) fail('UNSAFE_PATH', 'Symlink no checkout impede inventário seguro de instruções.')
      if (entry.isDirectory()) await walk(absolute, depth + 1)
      else if (kind) {
        const info = await lstat(absolute)
        if (!info.isFile() || info.nlink !== 1 || info.size > 1_048_576) fail('UNSAFE_PATH', 'Fonte de instrução especial ou excessiva.')
        found.push({ path, kind, contentHash: sha256(await readFile(absolute)) })
      }
    }
  }
  await walk(root, 0)
  return found.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}
export async function verifyInstructions(policy: ApprovedPolicy): Promise<string[]> {
  const inventory = await inventoryInstructions(policy.snapshot.workspaceRoot)
  const expected = [...policy.snapshot.trustedInstructions].sort((a, b) => a.path.localeCompare(b.path, 'en'))
  if (canonicalJson(inventory) !== canonicalJson(expected)) fail('UNTRUSTED_INSTRUCTIONS', 'Fontes carregáveis diferem dos caminhos e hashes aprovados.')
  return Promise.all(expected.map(source => checkoutPath(policy.snapshot.workspaceRoot, source.path)))
}
/** Call before turn/start in addition to the inventory/hash gate. */
export function assertInstructionSources(policy: ApprovedPolicy, reported: readonly string[]): void {
  const trusted = new Set(policy.snapshot.trustedInstructions.map(source => join(policy.snapshot.workspaceRoot, source.path)))
  if (reported.some(path => !trusted.has(path)) || new Set(reported).size !== reported.length) fail('UNTRUSTED_INSTRUCTIONS', 'Codex informou instruções sem confiança explícita.')
}
/** Configuration from ancestors is never implicitly trusted. A dedicated parent must be inert. */
export async function assertInertAncestors(workspaceRoot: string): Promise<void> {
  let directory = join(workspaceRoot, '..')
  while (true) {
    await canonicalAbsolute(directory)
    for (const name of ['AGENTS.md', 'AGENTS.override.md', '.codex', '.agents', '.claude', '.mcp.json']) {
      try { await lstat(join(directory, name)); fail('UNTRUSTED_INSTRUCTIONS', 'Ancestral contém instruções/configuração autocarregável não aprovadas.') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    const parent = join(directory, '..')
    if (parent === directory) break
    directory = parent
  }
}
