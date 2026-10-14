import { strict as assert } from 'node:assert'
import { setImmediate as tick } from 'node:timers/promises'
import { ExecutionService } from '@ioteams/runtime'
import { FixtureExecutionService } from '../../integration/runtime/execution.fixture.js'
import { FixtureLifetime } from './repository.js'

// GC belongs only to this disposable child, never the CLI or Vitest process.
if (typeof globalThis.gc !== 'function') throw new Error('isolated regression requires --expose-gc')
const requestedMethod = process.argv[2]
if (requestedMethod !== 'start' && requestedMethod !== 'resume') throw new Error('invalid fixture method')
const method: 'start' | 'resume' = requestedMethod
async function observe(overlap: boolean) {
  const original = ExecutionService.prototype[method]
  const owner = new AbortController(), lifetime = new FixtureLifetime()
  let begin!: () => void, ready!: () => void, finish!: () => void
  const beforeTurn = new Promise<void>(resolve => begin = resolve)
  const turnReady = new Promise<void>(resolve => ready = resolve)
  const finished = new Promise<void>(resolve => finish = resolve)
  let later: AbortSignal | undefined
  ExecutionService.prototype[method] = async function(...args: Parameters<typeof original>) {
    if ((args[0] as { id: string }).id === 'short') return { id: 'short', status: 'completed' }
    await beforeTurn
    later = AbortSignal.any([args[3]!])
    ready()
    await finished
    return { id: 'long', status: 'completed' }
  }
  try {
    const service = new FixtureExecutionService({ lifetime } as ConstructorParameters<typeof FixtureExecutionService>[0])
    function launch() {
      const incoming = AbortSignal.any([owner.signal])
      const long = service[method]({ id: 'long' }, {} as never, {} as never, incoming)
      const short = overlap ? service[method]({ id: 'short' }, {} as never, {} as never, incoming) : undefined
      return { long, short, incomingRef: new WeakRef(incoming) }
    }
    const { long, short, incomingRef } = launch()
    await short // A short overlapping call must not release the long call's retention.
    let control: object | undefined = {}
    const controlRef = new WeakRef(control)
    control = undefined
    await tick()
    for (let i = 0; i < 6; i++) { globalThis.gc!(); await tick() }
    assert.equal(controlRef.deref(), undefined, 'GC comparison was inconclusive')
    begin(); await turnReady
    owner.abort()
    const result = { method, overlap, incomingCollected: incomingRef.deref() === undefined, propagated: later!.aborted }
    finish(); await long
    return result
  } finally {
    begin(); finish(); ExecutionService.prototype[method] = original
    await lifetime.cleanup()
  }
}
const results = [await observe(false), await observe(true)]
console.log(JSON.stringify(results))
for (const result of results) assert.equal(result.propagated, true, 'fixture lost incoming cancellation before a later composed turn')
