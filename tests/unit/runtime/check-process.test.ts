import { ChildProcess } from 'node:child_process'
import { expect, it } from 'vitest'
import * as checks from '../../../packages/runtime/src/checks.js'

function childFixture() {
  const child = new ChildProcess()
  Object.defineProperty(child, 'pid', { value: 12345 })
  return child
}
it.each(['CHECK_INTERRUPTED', 'CHECK_TIMEOUT', 'CHECK_OUTPUT_LIMIT'] as const)('contains EPERM during %s and waits for separate closure proof', async reason => {
  const child = childFixture(), controller = new AbortController(), targets: number[] = []
  const supervisor = checks.superviseCheckProcess(child, reason === 'CHECK_TIMEOUT' ? 5 : 1000, controller.signal, pid => {
    targets.push(pid); throw Object.assign(new Error('Denied scoped signal'), { code: 'EPERM' })
  }, () => true)
  const rejected = expect(supervisor.result).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE', cause: { code: 'EPERM' } })
  if (reason === 'CHECK_INTERRUPTED') expect(() => controller.abort()).not.toThrow()
  if (reason === 'CHECK_OUTPUT_LIMIT') expect(() => supervisor.stop(reason)).not.toThrow()
  await rejected
  let closed = false; void supervisor.closed.then(() => { closed = true })
  await Promise.resolve(); expect(closed).toBe(false)
  expect(targets).toEqual([12345])
  supervisor.stop(reason); expect(targets).toHaveLength(1)
  child.emit('exit', 0, null)
  supervisor.stop(reason); expect(targets).toHaveLength(1)
  child.emit('close', 0, null); await supervisor.closed
  supervisor.stop(reason); expect(targets).toHaveLength(1)
})
it('never signals a numeric PGID after exit while waiting for stdio close', async () => {
  const child = childFixture(), targets: number[] = []
  const supervisor = checks.superviseCheckProcess(child, 1000, undefined, pid => { targets.push(pid) }, () => true)
  child.emit('exit', 0, null)
  supervisor.stop('CHECK_INTERRUPTED')
  await expect(supervisor.result).rejects.toMatchObject({ code: 'CHECK_INTERRUPTED' })
  expect(targets).toEqual([])
  child.emit('close', 0, null); await supervisor.closed
  expect(targets).toEqual([])
})
it('settles a spawn error once, but confirms closure only on close', async () => {
  const child = new ChildProcess(), targets: number[] = []
  const supervisor = checks.superviseCheckProcess(child, 1000, undefined, pid => { targets.push(pid) }, () => true)
  expect(() => child.emit('error', Object.assign(new Error('Missing executable'), { code: 'ENOENT' }))).not.toThrow()
  await expect(supervisor.result).rejects.toMatchObject({ code: 'CHECK_INFRASTRUCTURE', cause: { code: 'ENOENT' } })
  let closed = false; void supervisor.closed.then(() => { closed = true })
  await Promise.resolve(); expect(closed).toBe(false)
  child.emit('close', -2, null); await supervisor.closed
  expect(targets).toEqual([])
})
it('rejects successful evidence when a group remains after close and awaits an absence observation', async () => {
  const child = childFixture(), targets: number[] = []
  let absent = false
  const supervisor = checks.superviseCheckProcess(child, 1000, undefined, pid => { targets.push(pid) }, () => absent)
  const result = expect(supervisor.result).rejects.toMatchObject({ code: 'CHECK_TERMINATION_UNCERTAIN' })
  try {
    child.emit('exit', 0, null); child.emit('close', 0, null)
    await result
    let quiescent = false; void supervisor.quiescent.then(() => { quiescent = true })
    await Promise.resolve(); expect(quiescent).toBe(false)
    expect(targets).toEqual([])
    absent = true; await supervisor.quiescent
    expect(targets).toEqual([])
  } finally { absent = true }
})
it('contains a denied absence probe without treating close as group quiescence', async () => {
  const child = childFixture()
  let denied = true
  const supervisor = checks.superviseCheckProcess(child, 1000, undefined, () => { throw new Error('Must not signal after exit') }, () => {
    if (denied) throw Object.assign(new Error('Denied observation'), { code: 'EPERM' })
    return true
  })
  const result = expect(supervisor.result).rejects.toMatchObject({ code: 'CHECK_TERMINATION_UNCERTAIN', cause: { code: 'EPERM' } })
  try {
    child.emit('exit', 0, null)
    expect(() => child.emit('close', 0, null)).not.toThrow()
    await result
  } finally { denied = false; await supervisor.quiescent }
})
