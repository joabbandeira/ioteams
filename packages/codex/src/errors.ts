export class CodexHostError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'CodexHostError' }
}
export function hostError(error: unknown): CodexHostError {
  return error instanceof CodexHostError ? error : new CodexHostError('HOST_FAILURE', 'Operação Codex falhou; consulte o estado antes de repetir.')
}
