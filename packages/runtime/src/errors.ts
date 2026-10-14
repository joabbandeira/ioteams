export class RuntimePolicyError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'RuntimePolicyError' }
}
export function fail(code: string, message: string): never { throw new RuntimePolicyError(code, message) }
