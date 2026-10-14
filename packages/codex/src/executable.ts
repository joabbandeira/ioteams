import { constants } from 'node:fs'
import { access, lstat, open, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isAbsolute, sep } from 'node:path'
import { CodexHostError } from './errors.js'
const fail = () => { throw new CodexHostError('UNSAFE_EXECUTABLE', 'Executável nativo canônico e verificado obrigatório.') }
const verified = new WeakSet<VerifiedCodexExecutable>()
export interface VerifiedCodexExecutable { readonly path: string; assertUnchanged(): Promise<void> }
export function isVerifiedExecutable(value: unknown): value is VerifiedCodexExecutable { return !!value && verified.has(value as VerifiedCodexExecutable) }
/** Operator supplied binary; never discover a launcher from the served checkout's PATH. */
export async function verifyCodexExecutable(path: string, checkoutRoots: readonly string[]): Promise<VerifiedCodexExecutable> {
  const roots = await Promise.all(checkoutRoots.map(root => realpath(root)))
  async function fingerprint() {
    if (!isAbsolute(path) || await realpath(path) !== path || roots.some(root => path === root || path.startsWith(root + sep))) fail()
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.mode & 0o022 || ![0, process.getuid?.()].includes(info.uid) || info.size > 268_435_456) fail()
    await access(path, constants.X_OK)
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const before = await handle.stat()
      if (before.ino !== info.ino || before.dev !== info.dev) fail()
      const bytes = await handle.readFile(), after = await handle.stat()
      if (!['7f454c46','cffaedfe','feedfacf','cefaedfe','feedface','cafebabe','bebafeca','cafebabf','bfbafeca'].includes(bytes.subarray(0, 4).toString('hex')) ||
        after.size !== before.size || after.mtimeMs !== before.mtimeMs || await realpath(path) !== path) fail()
      return JSON.stringify({ hash: createHash('sha256').update(bytes).digest('hex'), ino: info.ino, dev: info.dev, size: info.size, mode: info.mode, uid: info.uid })
    } finally { await handle.close() }
  }
  const original = await fingerprint()
  const result = Object.freeze({ path, async assertUnchanged() { if (await fingerprint() !== original) fail() } })
  verified.add(result); return result
}
