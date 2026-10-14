import { expect, it } from 'vitest'
import { initialTasks, movedTask, validateMove } from '../../painel/src/model.js'

it('replanejar preserva identidade, motivo e histórico, invalidando checks anteriores', () => {
  const rejected = { ...initialTasks.find(task => task.id === 'LISA-108')!, checks: [true, true, true] }
  const next = movedTask(rejected, 'TODO')
  expect(next.id).toBe('LISA-108')
  expect(next.reason).toBe(rejected.reason)
  expect(next.history.slice(0, -1)).toEqual(rejected.history)
  expect(next.checks).toEqual([false, false, false])
  expect(next.status).toBe('TODO')
  expect(rejected.checks).toEqual([true, true, true])
})
it('DONE requer os critérios e permanece terminal no protótipo', () => {
  const task = initialTasks.find(task => task.id === 'LISA-106')!
  expect(validateMove(task, 'DONE')).toMatch(/critérios/)
  expect(validateMove({ ...task, checks: [true, true, true] }, 'DONE')).toBeNull()
  expect(validateMove({ ...task, status: 'DONE' }, 'TODO')).not.toBeNull()
})
