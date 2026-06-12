// Post-build step for AI/crawler visibility (GEO):
// 1. Prerenders the React app and injects the HTML into dist/index.html so
//    crawlers that do not execute JavaScript see the full guides and tool
//    catalog in the raw HTML response.
// 2. Generates llms.txt (index for AI agents) and llms-full.txt (entire docs
//    in one Markdown file) and copies the raw section Markdown into
//    dist/content/<locale>/ so agents can fetch clean Markdown per section.
//
// Runs after `vite build`. Usage: node scripts/postbuild.mjs [mode]
import { build } from 'vite'
import { readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const ssrOut = resolve(root, 'dist-ssr')
const mode = process.argv[2] ?? 'prod'

const BASE_URL = 'https://developers.itmplatform.com/mcp'

// --- 1. Build the SSR bundle of the app -------------------------------------
await build({
  root,
  mode,
  logLevel: 'warn',
  build: {
    ssr: 'src/entry-server.tsx',
    outDir: 'dist-ssr',
    emptyOutDir: true,
  },
})

const entryUrl = pathToFileURL(resolve(ssrOut, 'entry-server.js')).href
const { render, getSections, manifest, toolSupplement, TOOL_CATEGORIES } = await import(entryUrl)

// --- 2. Inject prerendered HTML into dist/index.html ------------------------
const indexPath = resolve(dist, 'index.html')
const indexHtml = readFileSync(indexPath, 'utf8')
const marker = '<div id="root"></div>'
if (!indexHtml.includes(marker)) {
  throw new Error(`postbuild: marker ${marker} not found in dist/index.html`)
}
const appHtml = render()
writeFileSync(indexPath, indexHtml.replace(marker, `<div id="root">${appHtml}</div>`), 'utf8')
console.log(`postbuild: prerendered app HTML injected into dist/index.html (${(appHtml.length / 1024).toFixed(0)} KB)`)

// --- 3. Copy raw section Markdown to dist/content/<locale>/ -----------------
for (const locale of ['en', 'es']) {
  const srcDir = resolve(root, 'src/content/sections', locale)
  if (!existsSync(srcDir)) continue
  const outDir = resolve(dist, 'content', locale)
  mkdirSync(outDir, { recursive: true })
  for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.md'))) {
    copyFileSync(resolve(srcDir, file), resolve(outDir, file))
  }
}

// --- 4. Generate llms.txt and llms-full.txt ---------------------------------
const enSections = getSections('en')
// Only list Spanish sections that actually have a translated file (getSections
// falls back to English content for missing translations).
const esSections = getSections('es').filter((s) =>
  existsSync(resolve(root, 'src/content/sections/es', `${s.id}.md`)),
)

// First meaningful paragraph of a Markdown document, stripped of markup.
function summarize(md) {
  const paragraph = md
    .split(/\r?\n\r?\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('```') && !p.startsWith('<'))
  if (!paragraph) return ''
  const text = paragraph
    .replace(/\r?\n/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()
  return text.length > 200 ? `${text.slice(0, 197)}...` : text
}

const toolCount = manifest.tools.length

const llmsTxt = `# ITM Platform MCP Server

> ITM Platform is a project and portfolio management (PPM) SaaS. Its MCP (Model Context Protocol) server lets AI assistants such as Claude, ChatGPT/Codex, Copilot, and Cursor search projects and services, analyze portfolio and budget data, manage tasks, log risks and issues, and run DataMart queries on behalf of authenticated users, respecting their ITM Platform permissions.

Key facts:
- Hosted MCP endpoint (OAuth): https://api.itmplatform.com/v2/_/mcp/
- Local setup (stdio): npm package \`@itm-platform/mcp-server\` with an ITM Platform API key
- Server version: ${manifest.serverVersion}, exposing ${toolCount} tools
- Human-readable documentation: ${BASE_URL}/

## Documentation

${enSections.map((s) => `- [${s.title}](${BASE_URL}/content/en/${s.id}.md)${summarize(s.content) ? `: ${summarize(s.content)}` : ''}`).join('\n')}

## Full content

- [llms-full.txt](${BASE_URL}/llms-full.txt): all documentation sections plus the complete tool catalog in a single Markdown file

## Optional

${esSections.map((s) => `- [${s.title} (es)](${BASE_URL}/content/es/${s.id}.md)`).join('\n')}
`

writeFileSync(resolve(dist, 'llms.txt'), llmsTxt, 'utf8')

function toolToMarkdown(tool) {
  const supplement = toolSupplement[tool.name]
  const lines = [`#### ${tool.name}`, '', tool.description, '']
  if (supplement?.category) lines.push(`Category: ${supplement.category}`, '')
  const props = tool.inputSchema?.properties ?? {}
  const required = new Set(tool.inputSchema?.required ?? [])
  const propNames = Object.keys(props)
  if (propNames.length > 0) {
    lines.push('Parameters:', '')
    for (const name of propNames) {
      const p = props[name]
      const type = p?.type ?? 'unknown'
      const desc = p?.description ? ` -- ${p.description}` : ''
      lines.push(`- \`${name}\` (${type}${required.has(name) ? ', required' : ''})${desc}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

const toolsByCategory = new Map(TOOL_CATEGORIES.map((c) => [c, []]))
const uncategorized = []
for (const tool of manifest.tools) {
  const category = toolSupplement[tool.name]?.category
  if (category && toolsByCategory.has(category)) toolsByCategory.get(category).push(tool)
  else uncategorized.push(tool)
}
if (uncategorized.length > 0) {
  toolsByCategory.set('Other', [...(toolsByCategory.get('Other') ?? []), ...uncategorized])
}

const llmsFullTxt = `# ITM Platform MCP Server -- Full Documentation

> Complete documentation for the ITM Platform MCP server (version ${manifest.serverVersion}). Generated from ${BASE_URL}/

${enSections.map((s) => `## ${s.title}\n\n${s.content.trim()}`).join('\n\n')}

## Tool Catalog (${toolCount} tools)

${Array.from(toolsByCategory.entries())
  .filter(([, tools]) => tools.length > 0)
  .map(([category, tools]) => `### ${category}\n\n${tools.map(toolToMarkdown).join('\n')}`)
  .join('\n')}
`

writeFileSync(resolve(dist, 'llms-full.txt'), llmsFullTxt, 'utf8')
console.log(`postbuild: wrote llms.txt, llms-full.txt, and dist/content/{en,es} Markdown (${toolCount} tools, ${enSections.length} sections)`)

// --- 5. Clean up the SSR bundle ----------------------------------------------
rmSync(ssrOut, { recursive: true, force: true })
