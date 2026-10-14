import { parseFrontmatter } from '@ioteams/catalog'

export interface MarkdownChunk { heading: string; lineStart: number; lineEnd: number; excerpt: string }

/** Line intervals refer to the original file, including its frontmatter. No Markdown is executed. */
export function splitMarkdown(source: string, maxChars = 4096): MarkdownChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 4096) throw new Error('Limite de trecho inválido')
  const { bodyLineStart } = parseFrontmatter(source)
  const lines = source.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const sections: { start: number; heading: string }[] = [{ start: bodyLineStart - 1, heading: '' }]
  const headings: string[] = []
  let paragraphEnd = -1
  let fence: { marker: string; length: number } | undefined
  for (let i = bodyLineStart - 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    const fenced = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      paragraphEnd = -1
      if (fenced && fenced[1][0] === fence.marker && fenced[1].length >= fence.length && !fenced[2].trim()) fence = undefined
      continue
    }
    if (fenced) { paragraphEnd = -1; fence = { marker: fenced[1][0], length: fenced[1].length }; continue }
    const atx = /^ {0,3}(#{1,6})(?:\s+(.+?)\s*#*\s*|\s*)$/.exec(line)
    const setext = i > bodyLineStart - 1 && /^ {0,3}(=+|-+)\s*$/.exec(line)
    let start = i, level: number, title: string
    if (atx) { level = atx[1].length; title = atx[2] ?? '' }
    else if (setext && paragraphEnd === i - 1) {
      start = i - 1; level = setext[1][0] === '=' ? 1 : 2; title = lines[i - 1].trim()
    } else {
      const block = /^ {4}|^ {0,3}(?:>|[-+*]\s|\d+[.)]\s)/.test(line) || /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)
      paragraphEnd = line.trim() && !block ? i : -1
      continue
    }
    paragraphEnd = -1
    headings.length = level - 1
    headings[level - 1] = title
    const heading = headings.filter(Boolean).join(' > ')
    if (heading.length > 1024) throw new Error('Heading excede limite de 1024 caracteres')
    if (sections.at(-1)!.start === start) sections.pop()
    sections.push({ start, heading })
  }
  const chunks: MarkdownChunk[] = []
  for (const [position, section] of sections.entries()) {
    const end = sections[position + 1]?.start ?? lines.length
    let start = section.start, count = 0
    const emit = (until: number) => {
      const excerpt = lines.slice(start, until).join('\n')
      if (excerpt.trim()) chunks.push({ heading: section.heading, lineStart: start + 1, lineEnd: until, excerpt })
      start = until; count = 0
    }
    for (let i = start; i < end; i++) {
      if (lines[i].length > maxChars) throw new Error('Linha excede limite de trecho; divida a linha no corpus')
      const size = lines[i].length + (i > start ? 1 : 0)
      if (count + size > maxChars) emit(i)
      count += lines[i].length + (i > start ? 1 : 0)
    }
    emit(end)
  }
  return chunks
}
