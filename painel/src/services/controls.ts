import type { PanelSnapshot } from './client'
export interface ReviewedControl { path: string; version: number; action: string; runId?: string; requestId?: string; threadId?: string; turnId?: string }
export function controlIsCurrent(control: ReviewedControl, snapshot: PanelSnapshot): boolean {
  const [, , , resource, id] = control.path.split('/')
  if (resource === 'approvals') {
    const record = snapshot.approvals.find(item => item.data.id === id), approval = record?.data
    const run = snapshot.runs.find(item => item.data.id === approval?.runId)?.data
    return !!approval && record.version === control.version && approval.status === 'pending' &&
      approval.runId === control.runId && approval.requestId === control.requestId &&
      approval.threadId === control.threadId && approval.turnId === control.turnId &&
      run?.status === 'awaiting_approval' && run.threadId === approval.threadId && run.turnId === approval.turnId &&
      approvalDecisions(approval).includes(control.action)
  }
  const record = snapshot.runs.find(item => item.data.id === id)
  return !!record && record.version === control.version && runActions(record.data.status).includes(control.action)
}
export function runActions(status: PanelSnapshot['runs'][number]['data']['status']): string[] {
  if (['running', 'queued', 'awaiting_approval'].includes(status)) return ['pause', 'cancel']
  if (['paused', 'interrupted'].includes(status)) return ['resume', 'cancel']
  if (status === 'blocked') return ['cancel']
  return []
}
export function approvalDecisions(approval: PanelSnapshot['approvals'][number]['data']): string[] {
  const supported = ['decline', 'cancel', 'accept']
  const offered = approval.details.availableDecisions
  return approval.kind === 'command' && Array.isArray(offered) ? supported.filter(item => offered.includes(item)) : supported
}
