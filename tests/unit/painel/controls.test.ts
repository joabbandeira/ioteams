import { expect, it } from 'vitest'
import { approvalDecisions, controlIsCurrent } from '../../../painel/src/services/controls.js'
import type { PanelSnapshot } from '../../../painel/src/services/client.js'

const approval = { version: 2, data: { id: 'a1', projectId: 'p1', runId: 'r1', requestId: 'q1', threadId: 'th1', turnId: 'tu1', kind: 'command' as const, summary: 'Run a check', details: {}, status: 'pending' as const } }
const run = { version: 3, data: { id: 'r1', projectId: 'p1', planId: 'plan1', status: 'awaiting_approval' as const, threadId: 'th1', turnId: 'tu1' } }
const snapshot = { approvals: [approval], runs: [run] } as PanelSnapshot
const control = { path: '/api/v1/approvals/a1/decide', version: 2, action: 'accept', requestId: 'q1', runId: 'r1', threadId: 'th1', turnId: 'tu1' }
it('invalidates a reviewed decision when its version, request, turn or active run changes', () => {
  expect(controlIsCurrent(control, snapshot)).toBe(true)
  for (const data of [{ ...approval.data, status: 'accepted' as const }, { ...approval.data, turnId: 'tu2' }, { ...approval.data, requestId: 'q2' }])
    expect(controlIsCurrent(control, { ...snapshot, approvals: [{ version: 2, data }] })).toBe(false)
  expect(controlIsCurrent(control, { ...snapshot, approvals: [{ ...approval, version: 3 }] })).toBe(false)
  expect(controlIsCurrent(control, { ...snapshot, runs: [{ ...run, data: { ...run.data, status: 'paused' } }] })).toBe(false)
})
it('only offers supported v1 decisions declared by the native command request', () => {
  expect(approvalDecisions({ ...approval.data, details: { availableDecisions: ['decline', 'cancel', 'acceptForSession'] } })).toEqual(['decline', 'cancel'])
  expect(approvalDecisions({ ...approval.data, details: { availableDecisions: [] } })).toEqual([])
  expect(approvalDecisions(approval.data)).toEqual(['decline', 'cancel', 'accept'])
})
it('requires the same version and an eligible persisted status for run controls', () => {
  const pause = { path: '/api/v1/runs/r1/pause', version: 3, action: 'pause' }
  expect(controlIsCurrent(pause, snapshot)).toBe(true)
  expect(controlIsCurrent({ ...pause, version: 2 }, snapshot)).toBe(false)
  expect(controlIsCurrent({ ...pause, action: 'resume' }, snapshot)).toBe(false)
})
