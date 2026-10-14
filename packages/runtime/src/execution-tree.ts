import { lstat, readFile } from 'node:fs/promises'
import { gitCommand } from './git.js'
import { checkoutPath } from './paths.js'
import { canonicalJson, sha256 } from './policy.js'
import { fail } from './errors.js'
export interface TestedTree { treeHash: string; workingHash: string }
/** Index AND working files, including ignored/untracked files. No index writes here. */
export async function observeTree(root: string): Promise<TestedTree> {
  const names = [...new Set((await gitCommand(root, ['ls-files', '--cached', '--others', '-z'])).split('\0').filter(Boolean))].sort()
  if (names.length > 100_000) fail('TREE_LIMIT', 'Árvore excede limite de inspeção.')
  const files: unknown[] = []
  for (const name of names) {
    const path = await checkoutPath(root, name)
    try {
      const info = await lstat(path)
      if (!info.isFile() || info.nlink !== 1 || info.size > 32_000_000) fail('TREE_LIMIT', 'Árvore contém arquivo especial ou excessivo.')
      files.push([name, info.mode & 0o777, sha256(await readFile(path))])
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      files.push([name, 'deleted'])
    }
  }
  return { treeHash: (await gitCommand(root, ['write-tree'])).trim(), workingHash: sha256(canonicalJson(files)) }
}
export async function assertTree(root: string, expected: TestedTree): Promise<void> {
  if (canonicalJson(await observeTree(root)) !== canonicalJson(expected)) fail('TREE_CHANGED', 'Validação ou revisão modificou a árvore testada.')
}
