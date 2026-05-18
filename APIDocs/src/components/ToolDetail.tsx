import { useState } from 'react'
import { useLocaleContext } from '../hooks/useLocale'
import type { ToolManifestEntry } from '../content/tool-manifest-types'
import type { ToolEditorial } from '../content/tool-supplement'

interface ToolDetailProps {
  tool: ToolManifestEntry
  editorial?: ToolEditorial
}

interface SchemaProperty {
  type?: string
  description?: string
  enum?: string[]
  items?: { type?: string; enum?: string[] }
  default?: unknown
}

export function ToolDetail({ tool, editorial }: ToolDetailProps) {
  const { t } = useLocaleContext()
  const [showExample, setShowExample] = useState(false)

  const properties = (tool.inputSchema?.properties ?? {}) as Record<string, SchemaProperty>
  const required = new Set(tool.inputSchema?.required ?? [])
  const paramNames = Object.keys(properties)

  return (
    <div className="rounded-lg border p-4 mb-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
      <h4 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        <code className="font-mono text-sm" style={{ backgroundColor: 'var(--code-bg)', padding: '0.15em 0.35em', borderRadius: '0.25rem' }}>
          {tool.name}
        </code>
      </h4>
      <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{tool.description}</p>

      {editorial?.narrative && (
        <p className="text-sm italic mb-3" style={{ color: 'var(--text-muted)' }}>{editorial.narrative}</p>
      )}

      {paramNames.length > 0 && (
        <table className="w-full text-xs border-collapse mb-3">
          <thead>
            <tr>
              <th className="text-left p-2 font-semibold" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>{t('tool.param')}</th>
              <th className="text-left p-2 font-semibold" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>{t('tool.type')}</th>
              <th className="text-left p-2 font-semibold" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>{t('tool.required')}</th>
              <th className="text-left p-2 font-semibold" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>{t('tool.description')}</th>
            </tr>
          </thead>
          <tbody>
            {paramNames.map((name) => {
              const prop = properties[name]
              let typeLabel = prop.type ?? 'any'
              if (prop.type === 'array' && prop.items?.type) {
                typeLabel = `${prop.items.type}[]`
              }
              if (prop.enum) {
                typeLabel = prop.enum.map((v) => `"${v}"`).join(' | ')
              }
              if (prop.items?.enum) {
                typeLabel = `(${prop.items.enum.map((v) => `"${v}"`).join(' | ')})[]`
              }

              return (
                <tr key={name}>
                  <td className="p-2 font-mono" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>{name}</td>
                  <td className="p-2 font-mono" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{typeLabel}</td>
                  <td className="p-2" style={{ borderBottom: '1px solid var(--border-color)', color: required.has(name) ? 'var(--accent-warning)' : 'var(--text-muted)' }}>
                    {required.has(name) ? t('tool.yes') : t('tool.no')}
                  </td>
                  <td className="p-2" style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>{prop.description ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {editorial?.exampleResponse != null && (
        <div>
          <button
            onClick={() => setShowExample(!showExample)}
            className="text-xs font-medium px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            {showExample ? t('tool.hideExample') : t('tool.showExample')}
          </button>
          {showExample && (
            <pre className="mt-2 p-3 rounded text-xs overflow-x-auto" style={{ backgroundColor: 'var(--code-bg)', color: 'var(--text-primary)' }}>
              <code>{JSON.stringify(editorial.exampleResponse, null, 2)}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
