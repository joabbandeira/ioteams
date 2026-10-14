import { expect, it } from 'vitest'
import { recoveryQuery } from '../../../packages/runtime/src/knowledge-binding.js'
it('normalizes/deduplicates terms and stays inside both lexical and public search limits', () => {
  const terms = Array.from({ length: 80 }, (_, i) => `termo${i}` + 'x'.repeat(110))
  const goal = 'Referência REFERENCIA ' + terms.join(' ')
  const query = recoveryQuery(goal)
  expect(query.split(' ')[0]).toBe('referencia')
  expect(query.length).toBeLessThanOrEqual(2048)
  expect(query.split(' ').length).toBeLessThanOrEqual(32)
  expect(new Set(query.split(' ')).size).toBe(query.split(' ').length)
  expect(recoveryQuery(goal)).toBe(query)
})
it('does not forward oversized tokens or an empty punctuation-only goal to FTS', () => {
  expect(recoveryQuery('a'.repeat(129) + ' útil')).toBe('util')
  expect(recoveryQuery('!?')).toBe('')
})
