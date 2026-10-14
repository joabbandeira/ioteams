import { CatalogMetadataSchema, type CatalogMetadata } from '@ioteams/core'
import { isAlias, isNode, parseDocument, visit } from 'yaml'

export interface ParsedMarkdown {
  metadata: CatalogMetadata | null
  body: string
  bodyLineStart: number
}
/** Only declarative YAML 1.2 metadata is decoded. Body text is never interpreted. */
export function parseFrontmatter(source: string): ParsedMarkdown {
  const input = source.replace(/^\uFEFF/, '')
  const lines = input.split('\n')
  if (lines[0]?.replace(/\r$/, '') !== '---') return { metadata: null, body: source, bodyLineStart: 1 }
  const end = lines.findIndex((line, index) => index > 0 && line.replace(/\r$/, '') === '---')
  if (end < 0) throw new Error('Frontmatter sem fechamento')
  const header = lines.slice(1, end).join('\n')
  if (Buffer.byteLength(header) > 65_536) throw new Error('Frontmatter excede o limite de 64 KiB')
  const document = parseDocument(header, {
    version: '1.2', schema: 'core', customTags: [], resolveKnownTags: false,
    merge: false, uniqueKeys: true, strict: true,
  })
  if (document.errors.length || document.warnings.length) throw new Error('Frontmatter YAML inválido ou com tags não suportadas')
  let count = 0
  visit(document, (_key, node, path) => {
    if (++count > 2000 || path.length > 32) throw new Error('Frontmatter excede o limite estrutural')
    if (isAlias(node) || (isNode(node) && (node.tag || ('anchor' in node && node.anchor))))
      throw new Error('Tags, aliases e anchors não são permitidos em metadados')
  })
  const metadata = CatalogMetadataSchema.parse(document.toJS({ maxAliasCount: 0 }))
  return { metadata, body: lines.slice(end + 1).join('\n'), bodyLineStart: end + 2 }
}
