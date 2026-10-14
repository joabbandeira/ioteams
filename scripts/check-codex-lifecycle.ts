import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeRuntimeHome, verifyCodexExecutable, runtimeEnvironment } from '@ioteams/codex'
import { nativeRunner } from '../apps/cli/src/native.js'
// Explicit optional operator check. No login, app-server session, model or personal runtime access.
const binary = process.argv[2]
if (process.argv.length !== 3 || !binary) throw new Error('Provide the canonical native Codex executable')
const executable = await verifyCodexExecutable(binary, [await realpath(process.cwd())])
const root = await mkdtemp(join(await realpath(tmpdir()), 'ioteams-t15-native-lifecycle-'))
try {
  const runtimeHome = join(root, 'runtime'), options = { runtimeHome, checkoutRoots: [await realpath(process.cwd())], nativeExecutable: executable }
  for (let invocation = 0; invocation < 2; invocation++) {
    await initializeRuntimeHome(options)
    const result = await nativeRunner(executable.path, ['--version'], { cwd: runtimeHome, env: runtimeEnvironment(runtimeHome) })
    if (result.code !== 0 || result.stdout.trim() !== 'codex-cli 0.162.1') throw new Error('Native lifecycle/version verification failed')
  }
  await initializeRuntimeHome(options)
  console.log(JSON.stringify({ status: 'verified', invocations: 2, version: '0.162.1', authentication: false, inference: false }))
} finally { await rm(root, { recursive: true, force: true }) }
