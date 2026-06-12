// Build-time prerender entry. Bundled by `vite build --ssr` and executed in
// Node by scripts/postbuild.mjs to inject static HTML into dist/index.html
// and to generate llms.txt artifacts. Never shipped to the browser.
import { renderToString } from 'react-dom/server'
import { LocaleProvider } from './hooks/useLocale'
import { App } from './App'
import { getGuideSections } from './content/guide-sections'
import type { Locale } from './content/types'
import manifestData from './content/tool-manifest.json'
import type { ToolManifest } from './content/tool-manifest-types'
import { toolSupplement, TOOL_CATEGORIES } from './content/tool-supplement'

export function render(): string {
  return renderToString(
    <LocaleProvider>
      <App />
    </LocaleProvider>,
  )
}

export function getSections(locale: Locale) {
  return getGuideSections(locale)
}

export const manifest = manifestData as ToolManifest
export { toolSupplement, TOOL_CATEGORIES }
