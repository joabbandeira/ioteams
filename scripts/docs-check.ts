import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import GithubSlugger from 'github-slugger'
import { marked, type Token, type Tokens } from 'marked'
import { loadCatalog } from '@ioteams/catalog'

const excluded = new Set(['node_modules', 'dist', 'build', 'coverage', 'playwright-report', 'test-results'])
interface Document { links: string[]; anchors: Set<string> }
function inlineText(tokens: Token[]): string {
  return tokens.map(token => 'tokens' in token && token.tokens ? inlineText(token.tokens)
    : 'text' in token ? token.text : '').join('')
}
function inspectMarkdown(source: string): Document {
  const links: string[] = [], anchors = new Set<string>(), slugger = new GithubSlugger()
  marked.walkTokens(marked.lexer(source), token => {
    if (token.type === 'link' || token.type === 'image') links.push(token.href)
    if (token.type === 'heading') anchors.add(slugger.slug(inlineText((token as Tokens.Heading).tokens)))
    if (token.type === 'html') for (const match of token.text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1])
  })
  return { links, anchors }
}
async function safeTarget(root: string, path: string) {
  const local = relative(root, path)
  if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error('Link sai do repositório')
  let current = root
  for (const part of local.split(sep).filter(Boolean)) {
    current = join(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Link segue symlink')
  }
  return lstat(path)
}
export async function checkDocumentation(root: string): Promise<{ documents: number; entities: number; errors: string[] }> {
  const absolute = resolve(root), errors: string[] = [], documents = new Map<string, Document>()
  if ((await lstat(absolute)).isSymbolicLink() || await realpath(absolute) !== absolute) throw new Error('Raiz contém symlink')
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || excluded.has(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) { errors.push(`${relative(absolute, path)}: symlink não permitido`); continue }
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        if ((await lstat(path)).size > 1_048_576) { errors.push(`${relative(absolute, path)}: limite de 1 MiB`); continue }
        documents.set(path, inspectMarkdown(await readFile(path, 'utf8')))
      }
    }
  }
  await walk(absolute)
  for (const [path, document] of documents) for (const href of document.links) {
    try {
      if (/^(?:https?:|mailto:)/i.test(href)) continue
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//') || href.includes('\\')) throw new Error('Protocolo de link não permitido')
      const [location, fragment] = href.split('#', 2)
      const targetName = decodeURIComponent(location.split('?', 1)[0])
      const target = targetName ? resolve(targetName.startsWith('/') ? absolute : dirname(path), targetName.replace(/^\//, '')) : path
      const targetStat = await safeTarget(absolute, target)
      if (fragment && targetStat.isFile() && target.endsWith('.md') && !documents.get(target)?.anchors.has(decodeURIComponent(fragment)))
        throw new Error('Âncora Markdown ausente')
    } catch (error) {
      const message = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'Destino local ausente' : (error as Error).message
      // Keep diagnostics local and avoid echoing arbitrary linked URLs or document contents.
      errors.push(`${relative(absolute, path)}: ${message}`)
    }
  }
  let entities = 0
  try { entities = (await loadCatalog(absolute)).length } catch (error) { errors.push(`Catálogo: ${(error as Error).message}`) }
  return { documents: documents.size, entities, errors }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkDocumentation(fileURLToPath(new URL('..', import.meta.url)))
    for (const error of result.errors) console.error(error)
    console.log(`docs:check: ${result.documents} documentos, ${result.entities} entidades, ${result.errors.length} erros.`)
    process.exitCode = result.errors.length ? 1 : 0
  } catch (error) { console.error((error as Error).message); process.exitCode = 1 }
}
