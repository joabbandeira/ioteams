import { mkdir, open, readFile, statfs, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { IdentifierSchema, GitShaSchema } from '@ioteams/core'
import { gitCommand, inspectRepository, verifyRepository, changedPaths, RepositorySchema, type RepositoryIdentity } from './git.js'
import { canonicalAbsolute, maybeStat, privateState, overlaps } from './paths.js'
import { assertAllowedPaths, type ApprovedPolicy } from './policy.js'
import { assertInertAncestors, verifyInstructions } from './instructions.js'
import { fail } from './errors.js'
export interface WriterLease { assertOwned(): Promise<void>; release(): Promise<void> }
export async function acquireWriter(repository: RepositoryIdentity, stateDirectory: string): Promise<WriterLease> {
  repository = RepositorySchema.parse(repository)
  await privateState(stateDirectory, [repository.root])
  await verifyRepository(repository, { allowWriter: true })
  const file = join(repository.commonDir, 'ioteams-writer.lock')
  let handle
  try { handle = await open(file, 'wx', 0o600) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('WORKSPACE_BUSY', 'Outro escritor ou reserva pendente exige reconciliação.')
    throw error
  }
  const identity = await handle.stat(), token = randomUUID()
  const contents = JSON.stringify({ version: 1, token, pid: process.pid, repository: repository.root })
  try { await handle.writeFile(contents); await handle.sync() } catch (error) { await handle.close(); throw error }
  let released = false
  async function assertOwned() {
    if (released) fail('WRITER_RELEASED', 'Reserva do escritor já foi liberada.')
    const current = await maybeStat(file)
    if (!current?.isFile() || current.isSymbolicLink() || current.nlink !== 1 || current.ino !== identity.ino || current.dev !== identity.dev || current.size !== Buffer.byteLength(contents) || await readFile(file, 'utf8') !== contents)
      fail('WRITER_CHANGED', 'Reserva do escritor foi alterada; reconciliação necessária.')
  }
  return {
    assertOwned,
    async release() {
      if (released) return
      try { await assertOwned(); await unlink(file); released = true } finally { await handle.close() }
    },
  }
}
export interface Workspace extends WriterLease { readonly repository: RepositoryIdentity }
/** Clone only from the verified local source. Never fetch/push/reset or reuse an existing target. */
export async function createWorkspace(policy: ApprovedPolicy): Promise<Workspace> {
  const { repository: source, workspaceRoot, plan } = policy.snapshot
  const stateDirectory = join(policy.file, '..')
  await privateState(stateDirectory, [source.root, workspaceRoot, ...policy.snapshot.corpusRoots])
  await verifyRepository(source, { clean: true })
  await canonicalAbsolute(workspaceRoot)
  if (await maybeStat(workspaceRoot)) fail('WORKSPACE_EXISTS', 'Destino deve ser novo e exclusivo.')
  if (overlaps(source.root, workspaceRoot)) fail('UNSAFE_PATH', 'Checkout deve ser separado da origem.')
  await assertInertAncestors(workspaceRoot)
  // A conservative upper bound: twice the source directory size, including Git objects.
  const usage = await gitCommand(source.root, ['count-objects', '-v'])
  const packedKiB = Number(/^size-pack: (\d+)$/m.exec(usage)?.[1] ?? 0)
  const looseKiB = Number(/^size: (\d+)$/m.exec(usage)?.[1] ?? 0)
  const listing = await gitCommand(source.root, ['ls-tree', '-r', '-l', plan.baseSha])
  const trackedBytes = listing.split('\n').reduce((sum, line) => sum + Number(/^\d+ \w+ [a-f0-9]+\s+(\d+)\t/.exec(line)?.[1] ?? 0), 0)
  const peak = 2 * ((packedKiB + looseKiB) * 1024 + trackedBytes) + 10_000_000
  const disk = await statfs(join(workspaceRoot, '..'))
  if (disk.bavail * disk.bsize - peak < 5_000_000_000) fail('INSUFFICIENT_DISK', 'Checkout não preservaria a reserva operacional de disco.')
  const sourceLease = await acquireWriter(source, stateDirectory)
  let targetLease: WriterLease | undefined
  try {
    await verifyRepository(source, { clean: true, allowWriter: true })
    await mkdir(workspaceRoot, { mode: 0o700 })
    await gitCommand(source.root, ['clone', '--no-hardlinks', '--no-checkout', '--no-local', '--', source.root, workspaceRoot])
    await gitCommand(workspaceRoot, ['remote', 'set-url', 'origin', source.remoteUrl])
    if (plan.remote !== 'origin') await gitCommand(workspaceRoot, ['remote', 'rename', 'origin', plan.remote])
    await gitCommand(workspaceRoot, ['checkout', '--no-guess', plan.branch])
    const repository = Object.freeze(await inspectRepository(workspaceRoot, plan.remote))
    await verifyRepository(repository, { expectedSha: plan.baseSha, clean: true })
    await verifyRepository(source, { clean: true, allowWriter: true })
    await sourceLease.assertOwned()
    await verifyInstructions(policy)
    targetLease = await acquireWriter(repository, stateDirectory)
    const checkoutLease = targetLease
    return Object.freeze({ repository,
      async assertOwned() { await sourceLease.assertOwned(); await checkoutLease.assertOwned() },
      async release() {
        // Never free the original while the checkout reservation is still uncertain.
        await checkoutLease.release()
        await sourceLease.release()
      },
    })
  } catch (error) {
    if (targetLease) await targetLease.release()
    // Retain source reservation and partial checkout on failure. No new demand may
    // run until the owner reconciles both; restart must never remove a stale lock.
    throw error
  }
}
export async function verifyWorkspace(policy: ApprovedPolicy, workspace: Workspace, options: { expectedSha: string; baseSha?: string; taskId?: string; clean?: boolean }): Promise<string[]> {
  options = z.strictObject({ expectedSha: GitShaSchema, baseSha: GitShaSchema.optional(), taskId: IdentifierSchema.optional(), clean: z.boolean().optional() }).parse(options)
  await workspace.assertOwned()
  if (workspace.repository.root !== policy.snapshot.workspaceRoot || workspace.repository.branch !== policy.snapshot.plan.branch || workspace.repository.remote !== policy.snapshot.plan.remote || workspace.repository.remoteUrl !== policy.snapshot.repository.remoteUrl)
    fail('REPOSITORY_CHANGED', 'Workspace não corresponde à política aprovada.')
  await verifyRepository(workspace.repository, { expectedSha: options.expectedSha, clean: options.clean, allowWriter: true })
  const baseSha = GitShaSchema.parse(options.baseSha ?? policy.snapshot.plan.baseSha)
  await gitCommand(workspace.repository.root, ['merge-base', '--is-ancestor', policy.snapshot.plan.baseSha, baseSha])
  await gitCommand(workspace.repository.root, ['merge-base', '--is-ancestor', baseSha, options.expectedSha])
  await verifyInstructions(policy)
  const paths = await changedPaths(workspace.repository.root, baseSha)
  if (paths.length && !options.taskId) fail('UNKNOWN_TASK', 'Alterações exigem tarefa aprovada e base da tentativa.')
  if (options.taskId) await assertAllowedPaths(policy, options.taskId, paths)
  return paths
}
