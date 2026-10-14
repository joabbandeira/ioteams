/** User text becomes an AND of quoted tokens; FTS operators are never passed through. */
export function lexicalQuery(query: string): string | null {
  const normalized = query.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').toLowerCase()
  const tokens = [...new Set(normalized.match(/[\p{L}\p{N}_]+/gu) ?? [])]
  if (tokens.length > 32 || tokens.some(token => token.length > 128)) throw new Error('Consulta excede limite de termos')
  return tokens.length ? tokens.map(token => `"${token}"`).join(' AND ') : null
}
