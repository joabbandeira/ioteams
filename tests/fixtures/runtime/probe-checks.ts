// Optional local OS-sandbox proof. No login, inference, credentials or remote service.
import { dirname, join } from 'node:path'
import { readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { approvePolicy, assertCheckCommand, createNativeCheckSandbox, createWorkspace, inspectRepository, preparePolicy } from '@ioteams/runtime'
import { git, repository } from './repository.js'
const executable = process.argv[2]
if (!executable?.startsWith('/')) throw new Error('Provide the installed canonical absolute Codex binary')
const f = await repository()
const paths = { allowed: join(f.workspaceRoot, 'src/check-write.txt'), outside: join(f.workspaceRoot, 'docs/blocked.txt'), original: join(f.source, 'src/blocked.txt'), git: join(f.workspaceRoot, '.git/check-write'), instructions: join(f.workspaceRoot, 'src/AGENTS.md'), scratch: join(f.runtimeHome, 'tmp/scratch.txt') }
const resultPath = join(f.runtimeHome, 'tmp/observed.json')
const source = `import fs from 'node:fs';\nconst observed={};\nfor(const [key,path] of Object.entries(${JSON.stringify(paths)})){try{fs.writeFileSync(path,'fixture');observed[key]='allowed'}catch{observed[key]='denied'}}\ntry{fs.readFileSync(${JSON.stringify(join(f.runtimeHome, 'nonsecret-marker.txt'))});observed.runtime='allowed'}catch{observed.runtime='denied'}\nfs.writeFileSync(${JSON.stringify(resultPath)},JSON.stringify(observed));\n`
await writeFile(join(f.source, 'src/probe.mjs'), source)
await git(f.source, 'add', 'src'); await git(f.source, 'commit', '-m', 'sandbox fixture')
f.plan.baseSha = await git(f.source, 'rev-parse', 'HEAD')
f.plan.tasks[0].checks = [{ executable: 'node', args: ['src/probe.mjs'], timeoutMs: 10000 }]
const draft = await preparePolicy({ plan: f.plan, repository: await inspectRepository(f.source, 'origin'), workspaceRoot: f.workspaceRoot, trustedInstructions: [], toolReadRoots: [await realpath('/opt/homebrew/Cellar'), await realpath('/opt/homebrew/opt'), await realpath('/opt/homebrew/etc/openssl@3/openssl.cnf')] })
const policy = await approvePolicy(draft, draft.plan.policyHash, f.state), workspace = await createWorkspace(policy)
try {
  await writeFile(join(f.runtimeHome, 'nonsecret-marker.txt'), 'fabricated marker, never a credential')
  const sandbox = await createNativeCheckSandbox({ policy, taskId: 'task-1', runtimeHome: f.runtimeHome, codexExecutable: executable, searchPath: [dirname(await realpath(process.execPath)), '/usr/bin', '/bin'] })
  const result = await sandbox.execute(await assertCheckCommand(policy, 'task-1', f.plan.tasks[0].checks[0]))
  const observed = JSON.parse(await readFile(resultPath, 'utf8'))
  const expected = { allowed: 'allowed', outside: 'denied', original: 'denied', git: 'denied', instructions: 'denied', scratch: 'allowed', runtime: 'denied' }
  const passed = result.exitCode === 0 && JSON.stringify(observed) === JSON.stringify(expected)
  console.log(JSON.stringify({ passed, result, observed }))
  if (!passed) process.exitCode = 1
  await sandbox.dispose()
} catch (error) { console.log(JSON.stringify({ passed: false, code: (error as { code?: string }).code ?? 'PROBE_FAILED' })); process.exitCode = 1 }
finally { await workspace.release(); await rm(f.base, { recursive: true, force: true }) }
