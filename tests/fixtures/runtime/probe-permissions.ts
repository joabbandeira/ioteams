// Optional local diagnostic: no model, login or credentials. Not part of CI.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createCodexHost, initializeRuntimeHome } from '@ioteams/codex'
import { approvePolicy, preparePolicy, inspectRepository, inventoryInstructions, createWorkspace, buildPermissionConfig } from '@ioteams/runtime'
import { git, repository } from './repository.js'
const executable = process.argv[2]
if (!executable?.startsWith('/')) throw new Error('Pass the installed absolute Codex executable')
const f = await repository()
await writeFile(join(f.source, 'AGENTS.md'), 'Trusted fixture instructions; no additional authority.\n')
await git(f.source, 'add', 'AGENTS.md'); await git(f.source, 'commit', '-m', 'trusted instructions')
f.plan.baseSha = await git(f.source, 'rev-parse', 'HEAD')
const draft = await preparePolicy({ plan: f.plan, repository: await inspectRepository(f.source, 'origin'), workspaceRoot: f.workspaceRoot, trustedInstructions: await inventoryInstructions(f.source), toolReadRoots: [await realpath('/opt/homebrew/Cellar'), await realpath('/opt/homebrew/opt'), await realpath('/opt/homebrew/etc/openssl@3/openssl.cnf')] })
const policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
const workspace = await createWorkspace(policy)
try {
  const runtimeHome = join(f.base, 'runtime')
  await initializeRuntimeHome({ runtimeHome, checkoutRoots: [f.source, f.workspaceRoot] })
  await writeFile(join(runtimeHome, 'auth-marker.txt'), 'nonsecret fixture')
  await mkdir(join(f.workspaceRoot, 'src/nested'))
  const script = `import fs from 'node:fs';
const results = {};
for (const [key,path] of Object.entries(${JSON.stringify({ allowed: join(f.workspaceRoot, 'src/ok.txt'), outsideScope: join(f.workspaceRoot, 'docs/blocked.txt'), outsideCheckout: join(f.base, 'blocked.txt'), git: join(f.workspaceRoot, '.git/config'), newInstructions: join(f.workspaceRoot, 'src/nested/AGENTS.md'), caseInstruction: join(f.workspaceRoot, 'src/nested/agents.md'), trustedInstructions: join(f.workspaceRoot, 'AGENTS.md'), scratch: join(f.runtimeHome, 'tmp/check.tmp') })})) {
  try { fs.writeFileSync(path, 'probe'); results[key] = 'write-allowed' } catch { results[key] = 'write-denied' }
}
try { fs.readFileSync(${JSON.stringify(join(runtimeHome, 'auth-marker.txt'))}); results.runtime = 'read-allowed' } catch { results.runtime = 'read-denied' }
try { fs.readFileSync(${JSON.stringify(join(f.workspaceRoot, 'AGENTS.md'))}); results.trustedRead = 'read-allowed' } catch { results.trustedRead = 'read-denied' }
console.log(JSON.stringify(results));`
  await writeFile(join(f.workspaceRoot, 'src/probe.mjs'), script)
  for (const phase of ['implement', 'review'] as const) {
    const profile = await buildPermissionConfig(policy, { taskId: 'task-1', phase, runtimeHome })
    await writeFile(join(runtimeHome, 'config.toml'), profile.config, { mode: 0o600 })
    const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: join(runtimeHome, 'home'), CODEX_HOME: runtimeHome, CODEX_SQLITE_HOME: join(runtimeHome, 'sqlite'), TMPDIR: join(runtimeHome, 'tmp') }
    try {
      const result = await promisify(execFile)(executable, ['sandbox', '--include-managed-config', '-P', profile.name, '-C', f.workspaceRoot, '--', process.execPath, 'src/probe.mjs'], { cwd: f.workspaceRoot, env, timeout: 15_000, maxBuffer: 65536 })
      const observed = JSON.parse(result.stdout.trim())
      const expected = { allowed: phase === 'implement' ? 'write-allowed' : 'write-denied', outsideScope: 'write-denied', outsideCheckout: 'write-denied', git: 'write-denied', newInstructions: 'write-denied', caseInstruction: 'write-denied', trustedInstructions: 'write-denied', scratch: 'write-allowed', runtime: 'read-denied', trustedRead: 'read-denied' }
      const passed = JSON.stringify(observed) === JSON.stringify(expected)
      console.log(JSON.stringify({ phase, exitCode: 0, passed, observed, stderr: result.stderr.trim() }))
      if (!passed) process.exitCode = 1
      async function links(directory: string): Promise<string[]> {
        const paths: string[] = []
        for (const name of await readdir(directory)) {
          const path = join(directory, name), info = await lstat(path)
          if (info.isSymbolicLink()) paths.push(path.slice(runtimeHome.length))
          else if (info.isDirectory()) paths.push(...await links(path))
        }
        return paths
      }
      console.log(JSON.stringify({ phase, generatedRuntimeLinks: await links(runtimeHome) }))
      const rpcRuntime = join(f.base, `${phase}-rpc-runtime`)
      await initializeRuntimeHome({ runtimeHome: rpcRuntime, checkoutRoots: [f.source, f.workspaceRoot] })
      const rpcProfile = await buildPermissionConfig(policy, { taskId: 'task-1', phase, runtimeHome: rpcRuntime })
      await writeFile(join(rpcRuntime, 'config.toml'), rpcProfile.config, { mode: 0o600 })
      const host = await createCodexHost({ runtimeHome: rpcRuntime, cwd: f.workspaceRoot, runId: 'probe-profile', permissionProfile: rpcProfile.name, executable, trustedInstructionSources: rpcProfile.trustedInstructionSources })
      try { console.log(JSON.stringify({ phase, profileAvailable: true })) } finally { await host.dispose() }
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string }
      console.log(JSON.stringify({ phase, exitCode: e.code, stdout: e.stdout?.trim(), stderr: e.stderr?.trim() }))
      process.exitCode = 1
    }
  }
} finally { await workspace.release(); await rm(f.base, { recursive: true, force: true }) }
