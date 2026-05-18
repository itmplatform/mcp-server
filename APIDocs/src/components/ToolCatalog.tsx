import { useState, useMemo } from 'react'
import { useLocaleContext } from '../hooks/useLocale'
import { ToolDetail } from './ToolDetail'
import type { ToolManifest } from '../content/tool-manifest-types'
import { toolSupplement, TOOL_CATEGORIES } from '../content/tool-supplement'

import manifestData from '../content/tool-manifest.json'

const manifest = manifestData as ToolManifest

type CatalogMode = 'overview' | 'detail'

interface ToolCatalogProps {
  mode: CatalogMode
}

export function ToolCatalog({ mode }: ToolCatalogProps) {
  const { t } = useLocaleContext()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const toolsByCategory = useMemo(() => {
    const groups = new Map<string, typeof manifest.tools>()
    for (const category of TOOL_CATEGORIES) {
      groups.set(category, [])
    }
    const uncategorized: typeof manifest.tools = []

    for (const tool of manifest.tools) {
      const supplement = toolSupplement[tool.name]
      const category = supplement?.category
      if (category && groups.has(category)) {
        groups.get(category)!.push(tool)
      } else {
        uncategorized.push(tool)
      }
    }

    if (uncategorized.length > 0) {
      const other = groups.get('Other') ?? []
      groups.set('Other', [...other, ...uncategorized])
    }

    return groups
  }, [])

  const filteredByCategory = useMemo(() => {
    if (!selectedCategory) return toolsByCategory
    const filtered = new Map<string, typeof manifest.tools>()
    for (const [cat, tools] of toolsByCategory) {
      if (cat === selectedCategory) filtered.set(cat, tools)
    }
    return filtered
  }, [toolsByCategory, selectedCategory])

  const filteredTools = useMemo(() => {
    if (!search.trim()) return filteredByCategory
    const q = search.toLowerCase()
    const result = new Map<string, typeof manifest.tools>()
    for (const [cat, tools] of filteredByCategory) {
      const matched = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(q) ||
          tool.description.toLowerCase().includes(q),
      )
      if (matched.length > 0) result.set(cat, matched)
    }
    return result
  }, [filteredByCategory, search])

  const totalTools = manifest.tools.length

  return (
    <div className="mt-4">
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('tools.searchPlaceholder')}
          className="flex-1 px-3 py-2 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-blue-400"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 text-sm rounded border focus:outline-none"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <option value="">{t('tools.allCategories')} ({totalTools})</option>
          {TOOL_CATEGORIES.map((cat) => {
            const count = toolsByCategory.get(cat)?.length ?? 0
            if (count === 0) return null
            return <option key={cat} value={cat}>{cat} ({count})</option>
          })}
        </select>
      </div>

      {Array.from(filteredTools.entries()).map(([category, tools]) => (
        <div key={category} className="mb-6">
          <h3 className="text-lg font-semibold mb-3 px-1" style={{ color: 'var(--text-primary)' }}>
            {category}
          </h3>
          {mode === 'overview' ? (
            <div className="space-y-1">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-baseline gap-3 px-3 py-2 rounded"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <code className="text-sm font-mono font-medium shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {tool.name}
                  </code>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {tool.description.split('.')[0]}.
                  </span>
                </div>
              ))}
            </div>
          ) : (
            tools.map((tool) => (
              <ToolDetail
                key={tool.name}
                tool={tool}
                editorial={toolSupplement[tool.name]}
              />
            ))
          )}
        </div>
      ))}

      {filteredTools.size === 0 && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>
          {t('tools.noResults')}
        </p>
      )}
    </div>
  )
}
