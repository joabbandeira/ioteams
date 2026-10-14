export const sha = 'a'.repeat(40)
export const hash = 'b'.repeat(64)
export const check = { executable: 'npm', args: ['test'], cwd: 'painel', timeoutMs: 60_000 }
export const task = {
  id: 'T01', title: 'Contratos verificáveis', professionalId: 'bia-martins', dependsOn: [],
  allowedPaths: ['packages/core', 'tests'], acceptanceCriteria: ['Rejeitar entradas inválidas'], checks: [check],
}
export const plan = {
  version: 1, id: 'plan-1', projectId: 'ioteams', teamId: 'lisa', goal: 'Entregar contratos seguros',
  branch: 'develop', remote: 'origin', baseSha: sha, tasks: [task], definitionOfDone: ['Checks aprovados'],
  limits: { maxAttempts: 3, turnTimeoutMs: 1_800_000 }, policyHash: hash,
}
export const citation = {
  documentId: 'doc-1', path: 'stacks/git/descricao.md', heading: 'Uso', lineStart: 5, lineEnd: 8,
  contentHash: hash, commitSha: sha, excerpt: 'Conteúdo declarativo.',
}
export const metadata = [
  { version: 1, kind: 'profession', id: 'desenvolvimento', name: 'Desenvolvimento' },
  { version: 1, kind: 'stack', id: 'git', name: 'Git' },
  ...['bia-martins', 'helena-costa', 'marcos-lima'].map(id => ({
    version: 1, kind: 'professional', id, name: id, fictitious: true,
    professionIds: ['desenvolvimento'], stackIds: ['git'],
  })),
  { version: 1, kind: 'team', id: 'lisa', name: 'LISA', members: [
    { professionalId: 'bia-martins', role: 'Developer' },
    { professionalId: 'helena-costa', role: 'Product Owner' },
    { professionalId: 'marcos-lima', role: 'Scrum Master' },
  ] },
]
export const attempt = {
  id: 'attempt-1', taskId: 'T01', attempt: 1, baseSha: sha, status: 'IN_PROGRESS',
  professionalId: 'bia-martins', evidenceIds: [], citationIds: ['doc-1'],
}
export const evidence = {
  id: 'evidence-1', taskId: 'T01', attemptId: 'attempt-1', command: check, exitCode: 0,
  startedAt: '2026-10-14T10:00:00.000Z', finishedAt: '2026-10-14T10:00:01.000Z',
  contentHash: hash, testedTreeHash: sha,
}
export const approval = {
  id: 'approval-1', runId: 'run-1', threadId: 'thread-1', turnId: 'turn-1', requestId: 'request-1',
  kind: 'command', summary: 'Executar npm test', details: { command: check }, status: 'pending',
}
export const turn = {
  identity: { professionalId: 'bia-martins', role: 'Developer' },
  objective: 'Implementar contratos', retrievedData: [citation], approvedPolicy: plan,
}
