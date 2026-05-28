import { useState } from 'react'
import { useLocaleContext } from '../hooks/useLocale'
import { CopyButton } from './CopyButton'

interface ConfigPanelProps {
  companySlug: string
}

type ClientId = 'claude-code' | 'claude-desktop' | 'vscode' | 'cursor' | 'codex' | 'windsurf' | 'jetbrains'

interface ClientConfig {
  id: ClientId
  label: string
  stdioConfig: (slug: string) => string
  hostedConfig: string
  filePath: { windows?: string; mac?: string; linux?: string; note?: string }
}

const MCP_URL = 'https://api.itmplatform.com/v2/_/mcp/'

function stdioBlock(slug: string): string {
  return JSON.stringify({
    mcpServers: {
      'itm-platform': {
        command: 'npx',
        args: ['@itm-platform/mcp-server'],
        env: {
          ITM_API_URL: 'https://api.itmplatform.com',
          ITM_COMPANY: slug || '{your-account}',
          ITM_API_KEY: 'your-api-key',
        },
      },
    },
  }, null, 2)
}

const CLIENTS: ClientConfig[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    stdioConfig: () => `claude mcp add --scope user itm-platform -- npx @itm-platform/mcp-server`,
    hostedConfig: `claude mcp add --scope user --transport http itm-platform ${MCP_URL}`,
    filePath: {
      note: 'Run in your terminal. The --scope user flag makes it available across all projects.',
    },
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    stdioConfig: stdioBlock,
    hostedConfig: `Use Settings > Connectors > Add custom connector\nand enter the URL:\n\n${MCP_URL}`,
    filePath: {
      windows: '%APPDATA%\\Claude\\claude_desktop_config.json',
      mac: '~/Library/Application Support/Claude/claude_desktop_config.json',
    },
  },
  {
    id: 'vscode',
    label: 'VS Code',
    stdioConfig: (slug) => JSON.stringify({
      servers: {
        'itm-platform': {
          type: 'stdio',
          command: 'npx',
          args: ['@itm-platform/mcp-server'],
          env: {
            ITM_API_URL: 'https://api.itmplatform.com',
            ITM_COMPANY: slug || '{your-account}',
            ITM_API_KEY: 'your-api-key',
          },
        },
      },
    }, null, 2),
    hostedConfig: JSON.stringify({
      servers: {
        'itm-platform': {
          type: 'http',
          url: MCP_URL,
        },
      },
    }, null, 2),
    filePath: {
      note: 'Save as .vscode/mcp.json in your workspace.',
    },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    stdioConfig: stdioBlock,
    hostedConfig: JSON.stringify({
      mcpServers: {
        'itm-platform': {
          url: MCP_URL,
        },
      },
    }, null, 2),
    filePath: {
      note: 'Save as .cursor/mcp.json in your project root, or ~/.cursor/mcp.json for global access.',
    },
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    stdioConfig: () => `[mcp_servers.itm-platform]\nurl = "${MCP_URL}"\nbearer_token_env_var = "ITM_API_TOKEN"`,
    hostedConfig: `codex mcp add itm-platform --url ${MCP_URL}`,
    filePath: {
      note: 'Run the command above, or add to ~/.codex/config.toml manually.',
    },
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    stdioConfig: (slug) => JSON.stringify({
      mcpServers: {
        'itm-platform': {
          command: 'npx',
          args: ['@itm-platform/mcp-server'],
          env: {
            ITM_API_URL: 'https://api.itmplatform.com',
            ITM_COMPANY: slug || '{your-account}',
            ITM_API_KEY: 'your-api-key',
          },
        },
      },
    }, null, 2),
    hostedConfig: JSON.stringify({
      mcpServers: {
        'itm-platform': {
          serverUrl: MCP_URL,
        },
      },
    }, null, 2),
    filePath: {
      windows: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json',
      mac: '~/.codeium/windsurf/mcp_config.json',
    },
  },
  {
    id: 'jetbrains',
    label: 'JetBrains',
    stdioConfig: stdioBlock,
    hostedConfig: JSON.stringify({
      mcpServers: {
        'itm-platform': {
          url: MCP_URL,
        },
      },
    }, null, 2),
    filePath: {
      note: 'Settings > Tools > AI Assistant > Model Context Protocol (MCP). Click Add and paste the JSON.',
    },
  },
]

export function ConfigPanel({ companySlug }: ConfigPanelProps) {
  const { t } = useLocaleContext()
  const [activeClient, setActiveClient] = useState<ClientId>('claude-code')
  const [showHosted, setShowHosted] = useState(true)

  const client = CLIENTS.find((c) => c.id === activeClient)!
  const snippet = showHosted
    ? client.hostedConfig
    : client.stdioConfig(companySlug)

  return (
    <div className="rounded-lg border overflow-hidden my-4" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex flex-wrap border-b" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveClient(c.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              activeClient === c.id
                ? 'border-b-2 border-blue-500 text-blue-600'
                : ''
            }`}
            style={activeClient !== c.id ? { color: 'var(--text-secondary)' } : undefined}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="p-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={showHosted}
              onChange={(e) => setShowHosted(e.target.checked)}
              className="rounded"
            />
            {t('config.hostedMode')}
          </label>
          <CopyButton text={snippet} />
        </div>

        <pre className="p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap" style={{ backgroundColor: 'var(--code-bg)', color: 'var(--text-primary)' }}>
          <code>{snippet}</code>
        </pre>

        <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {client.filePath.windows && (
            <p><strong>Windows:</strong> <code>{client.filePath.windows}</code></p>
          )}
          {client.filePath.mac && (
            <p><strong>macOS:</strong> <code>{client.filePath.mac}</code></p>
          )}
          {client.filePath.linux && (
            <p><strong>Linux:</strong> <code>{client.filePath.linux}</code></p>
          )}
          {client.filePath.note && (
            <p>{client.filePath.note}</p>
          )}
        </div>
      </div>
    </div>
  )
}
