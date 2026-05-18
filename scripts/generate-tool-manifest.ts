import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUTPUT = resolve(ROOT, 'APIDocs/src/content/tool-manifest.json')

interface McpResponse {
  result?: {
    tools?: Array<{
      name: string
      description: string
      inputSchema: unknown
    }>
  }
}

async function main() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))
  const serverVersion: string = pkg.version ?? '0.0.0'

  const serverPath = resolve(ROOT, 'dist/server.js')

  console.log(`Spawning MCP server: ${serverPath}`)
  const child = spawn('node', ['--env-file=.env', serverPath], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCP_TRANSPORT: 'stdio' },
  })

  let stdout = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { process.stderr.write(chunk) })

  const initRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'manifest-generator', version: '1.0.0' },
    },
  })

  const toolsRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  })

  await new Promise<void>((res) => setTimeout(res, 3000))

  child.stdin.write(initRequest + '\n')
  await new Promise<void>((res) => setTimeout(res, 2000))

  child.stdin.write(toolsRequest + '\n')
  await new Promise<void>((res) => setTimeout(res, 3000))

  child.kill('SIGTERM')

  const lines = stdout.split('\n').filter((l) => l.trim())
  let tools: Array<{ name: string; description: string; inputSchema: unknown }> = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as McpResponse
      if (parsed.result?.tools) {
        tools = parsed.result.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
      }
    } catch {
      // skip non-JSON lines
    }
  }

  if (tools.length === 0) {
    console.error('No tools found in server response. Falling back to empty manifest.')
  }

  const manifest = {
    serverVersion,
    tools,
  }

  writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
  console.log(`Wrote ${tools.length} tools to ${OUTPUT} (v${serverVersion})`)
}

main().catch((err) => {
  console.error('Manifest generation failed:', err)
  process.exit(1)
})
