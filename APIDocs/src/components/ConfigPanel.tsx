import { useState } from 'react'
import { useLocaleContext } from '../hooks/useLocale'
import { CopyButton } from './CopyButton'

interface ConfigPanelProps {
  companySlug: string
}

type ClientId = 'claude-desktop' | 'claude-code' | 'codex' | 'vscode' | 'cursor' | 'jetbrains'

interface ClientConfig {
  id: ClientId
  label: string
  stdioConfig: (slug: string) => string
  hostedConfig: string
  filePath: { windows?: string; mac?: string; linux?: string; note?: string }
}

const HOSTED_CONFIG = JSON.stringify({
  mcpServers: {
    'itm-platform': {
      type: 'http',
      url: 'https://mcp.itmplatform.com/mcp',
    },
  },
}, null, 2)

function stdioBlock(slug: string): string {
  return JSON.stringify({
    mcpServers: {
      'itm-platform': {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'itm-mcp'],
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
    id: 'claude-desktop',
    label: 'Claude Desktop',
    stdioConfig: stdioBlock,
    hostedConfig: HOSTED_CONFIG,
    filePath: {
      windows: '%APPDATA%\\Claude\\claude_desktop_config.json',
      mac: '~/Library/Application Support/Claude/claude_desktop_config.json',
    },
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    stdioConfig: (slug) => JSON.stringify({
      mcpServers: {
        'itm-platform': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'itm-mcp'],
          env: {
            ITM_API_URL: 'https://api.itmplatform.com',
            ITM_COMPANY: slug || '{your-account}',
            ITM_API_KEY: 'your-api-key',
          },
        },
      },
    }, null, 2),
    hostedConfig: HOSTED_CONFIG,
    filePath: {
      note: 'Run: claude mcp add itm-platform -- npx -y itm-mcp',
    },
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    stdioConfig: stdioBlock,
    hostedConfig: HOSTED_CONFIG,
    filePath: {
      note: 'Add to your Codex MCP server configuration.',
    },
  },
  {
    id: 'vscode',
    label: 'VS Code',
    stdioConfig: (slug) => JSON.stringify({
      'mcp.servers': {
        'itm-platform': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'itm-mcp'],
          env: {
            ITM_API_URL: 'https://api.itmplatform.com',
            ITM_COMPANY: slug || '{your-account}',
            ITM_API_KEY: 'your-api-key',
          },
        },
      },
    }, null, 2),
    hostedConfig: JSON.stringify({
      'mcp.servers': {
        'itm-platform': {
          type: 'http',
          url: 'https://mcp.itmplatform.com/mcp',
        },
      },
    }, null, 2),
    filePath: {
      note: 'Add to your VS Code settings.json (User or Workspace).',
    },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    stdioConfig: stdioBlock,
    hostedConfig: HOSTED_CONFIG,
    filePath: {
      note: 'Add to .cursor/mcp.json in your project root.',
    },
  },
  {
    id: 'jetbrains',
    label: 'JetBrains',
    stdioConfig: stdioBlock,
    hostedConfig: HOSTED_CONFIG,
    filePath: {
      note: 'Settings > Tools > AI Assistant > MCP Servers. Add a new server configuration.',
    },
  },
]

export function ConfigPanel({ companySlug }: ConfigPanelProps) {
  const { t } = useLocaleContext()
  const [activeClient, setActiveClient] = useState<ClientId>('claude-desktop')
  const [showHosted, setShowHosted] = useState(false)

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

        <pre className="p-3 rounded text-xs overflow-x-auto" style={{ backgroundColor: 'var(--code-bg)', color: 'var(--text-primary)' }}>
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
