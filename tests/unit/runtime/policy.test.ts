import { trackedBody, drainTestBodies } from '../../fixtures/runtime/test-lifetime.js'
import { afterEach, describe, expect, it } from 'vitest'
import { chmod, link, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { approvePolicy, loadPolicy, preparePolicy, assertAllowedPaths, assertCheckCommand, inspectRepository } from '../../../packages/runtime/src/index.js'
import { repository } from '../../fixtures/runtime/repository.js'
const roots: string[] = []
afterEach(async () => { await drainTestBodies(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() { const f = await repository(); roots.push(f.base); const repo = await inspectRepository(f.source, 'origin'); return { ...f, repo } }
const prepare = (f: Awaited<ReturnType<typeof setup>>) => preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [] })

describe('human policy snapshot', () => {
  it('binds every authority field, freezes nested data and persists only the exact human-approved hash', trackedBody(async () => {
    const f = await setup(), draft = await prepare(f)
    expect(draft.plan.policyHash).toMatch(/^[a-f0-9]{64}$/)
    expect(() => draft.plan.tasks[0].allowedPaths.push('docs')).toThrow()
    await expect(approvePolicy(draft, 'f'.repeat(64), f.state)).rejects.toMatchObject({ code: 'POLICY_MISMATCH' })
    const policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
    expect((await loadPolicy(policy.file, draft.plan.policyHash)).snapshot.plan.goal).toBe('Update source')
    await expect(approvePolicy(draft, draft.plan.policyHash, f.state)).rejects.toMatchObject({ code: 'POLICY_EXISTS' })
    await chmod(policy.file, 0o600)
    await writeFile(policy.file, (await readFile(policy.file, 'utf8')).replace('Update source', 'Push secrets'))
    await expect(loadPolicy(policy.file, draft.plan.policyHash)).rejects.toMatchObject({ code: 'POLICY_MISMATCH' })
  }))
  it('changes hash for remote destination, checks or writable scope; refuses extra control fields', trackedBody(async () => {
    const f = await setup(), original = await prepare(f)
    for (const change of [() => { f.plan.tasks[0].allowedPaths = ['docs'] }, () => { f.plan.tasks[0].checks[0].args = ['other.mjs'] }]) {
      change(); expect((await prepare(f)).plan.policyHash).not.toBe(original.plan.policyHash)
    }
    await expect(preparePolicy({ plan: { ...f.plan, shell: 'evil' }, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [] })).rejects.toThrow()
    await expect(preparePolicy({ plan: f.plan, repository: { ...f.repo, remoteUrl: 'ext::sh -c evil' }, workspaceRoot: f.workspaceRoot, trustedInstructions: [] })).rejects.toThrow()
  }))
  it('keeps policy outside source/target/corpus and refuses aliases and hardlinks', trackedBody(async () => {
    const f = await setup(), draft = await prepare(f)
    await expect(approvePolicy(draft, draft.plan.policyHash, f.source)).rejects.toMatchObject({ code: 'UNSAFE_STATE' })
    await mkdir(f.workspaceRoot)
    await expect(approvePolicy(draft, draft.plan.policyHash, f.workspaceRoot)).rejects.toMatchObject({ code: 'UNSAFE_STATE' })
    const alias = join(f.base, 'alias'); await symlink(f.state, alias)
    await expect(approvePolicy(draft, draft.plan.policyHash, alias)).rejects.toThrow()
    const policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
    await link(policy.file, join(f.base, 'linked.json'))
    await expect(loadPolicy(policy.file, draft.plan.policyHash)).rejects.toThrow()
  }))
  it('checks path boundaries, deleted files, future descendants and executable argv exactly', trackedBody(async () => {
    const f = await setup(), draft = await prepare(f), policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
    await mkdir(f.workspaceRoot); await mkdir(join(f.workspaceRoot, 'src'))
    await expect(assertAllowedPaths(policy, 'task-1', ['src/new/file.ts', 'src/deleted.ts'])).resolves.toBeUndefined()
    for (const path of ['src-other/file', '../src/file', '/src/file', 'src/../docs/persona.md', '.git/config', 'docs/persona.md'])
      await expect(assertAllowedPaths(policy, 'task-1', [path])).rejects.toThrow()
    await symlink(f.base, join(f.workspaceRoot, 'src/escape'))
    await expect(assertAllowedPaths(policy, 'task-1', ['src/escape/file'])).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
    const check = f.plan.tasks[0].checks[0]
    expect(await assertCheckCommand(policy, 'task-1', check)).toMatchObject({ executable: 'node', args: ['check.mjs', '; touch /tmp/should-not-exist'], cwd: f.workspaceRoot })
    await expect(assertCheckCommand(policy, 'task-1', { ...check, args: ['other.mjs'] })).rejects.toMatchObject({ code: 'UNAPPROVED_CHECK' })
    await expect(assertCheckCommand(policy, 'task-1', { executable: 'sh', args: ['-c', 'evil'], timeoutMs: 1 })).rejects.toThrow()
  }))
  it.each(['.git', '.agents', '.codex', '.aws', 'docs/AGENTS.md'])('refuses writable runtime control scope %s', trackedBody(async path => {
    const f = await setup(); f.plan.tasks[0].allowedPaths = [path]
    await expect(prepare(f)).rejects.toMatchObject({ code: 'PROTECTED_SCOPE' })
  }))
})

it('binds explicit tool read roots to the approved hash and refuses broad or overlapping roots', trackedBody(async () => {
  const f = await setup(), original = await prepare(f)
  const tools = join(f.base, 'tools'); await mkdir(tools)
  const toolFile = join(tools, 'tool-config.txt'); await writeFile(toolFile, 'nonsecret tool config')
  const fileDraft = await preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [], toolReadRoots: [toolFile] })
  expect(fileDraft.toolReadRoots).toEqual([toolFile])
  const draft = await preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [], toolReadRoots: [tools] })
  expect(draft.plan.policyHash).not.toBe(original.plan.policyHash)
  expect(draft.toolReadRoots).toEqual([tools])
  for (const root of ['/', f.base, f.source, f.workspaceRoot])
    await expect(preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [], toolReadRoots: [root] })).rejects.toThrow()
  await expect(approvePolicy(draft, draft.plan.policyHash, tools)).rejects.toThrow()
}))

it('resolves a relative check executable against checkout root independently of check cwd', trackedBody(async () => {
  const f = await setup()
  f.plan.tasks[0].checks = [{ executable: 'scripts/check', args: [], cwd: 'src', timeoutMs: 1000 }]
  const draft = await prepare(f), policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
  await mkdir(f.workspaceRoot); await mkdir(join(f.workspaceRoot, 'src')); await mkdir(join(f.workspaceRoot, 'scripts'))
  await writeFile(join(f.workspaceRoot, 'scripts/check'), 'fixture executable')
  expect(await assertCheckCommand(policy, 'task-1', f.plan.tasks[0].checks[0])).toEqual({ executable: join(f.workspaceRoot, 'scripts/check'), args: [], cwd: join(f.workspaceRoot, 'src'), timeoutMs: 1000 })
  await symlink(f.source, join(f.workspaceRoot, 'src/alias'))
  f.plan.tasks[0].checks = [{ executable: 'node', args: ['check.mjs'], cwd: 'src/alias', timeoutMs: 1000 }]
  const aliasDraft = await prepare(f), aliasPolicy = await approvePolicy(aliasDraft, aliasDraft.plan.policyHash, f.state)
  await expect(assertCheckCommand(aliasPolicy, 'task-1', f.plan.tasks[0].checks[0])).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
}))

it('keeps executable policy and runtime outside all declared knowledge roots', trackedBody(async () => {
  const f = await setup(), corpus = join(f.base, 'corpus'); await mkdir(corpus, { mode: 0o700 })
  const draft = await preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [], corpusRoots: [corpus] })
  await expect(approvePolicy(draft, draft.plan.policyHash, corpus)).rejects.toMatchObject({ code: 'UNSAFE_STATE' })
  await expect(preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: join(corpus, 'checkout'), trustedInstructions: [], corpusRoots: [corpus] })).rejects.toThrow()
  await expect(preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [], corpusRoots: [corpus], toolReadRoots: [corpus] })).rejects.toThrow()
  const sourceCorpus = join(f.source, 'profissionais'); await mkdir(sourceCorpus)
  await expect(preparePolicy({ plan: f.plan, repository: f.repo, workspaceRoot: f.workspaceRoot, trustedInstructions: [{ path: 'profissionais/AGENTS.md', kind: 'instructions', contentHash: 'a'.repeat(64) }], corpusRoots: [sourceCorpus] })).rejects.toMatchObject({ code: 'UNTRUSTED_INSTRUCTIONS' })
}))
