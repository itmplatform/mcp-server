import { useMemo, useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { useCompanySlug } from './hooks/useCompanySlug'
import { useScrollTracker } from './hooks/useScrollTracker'
import { useLocaleContext } from './hooks/useLocale'
import { getGuideSections } from './content/guide-sections'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { GuideSection } from './components/GuideSection'
import { ToolCatalog } from './components/ToolCatalog'
import { ConfigPanel } from './components/ConfigPanel'
import manifest from './content/tool-manifest.json'

export function App() {
  const { theme, toggleTheme } = useTheme()
  const { companySlug, setCompanySlug } = useCompanySlug()
  const { locale } = useLocaleContext()
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)

  const sections = useMemo(() => getGuideSections(locale), [locale])
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections])
  const activeSectionId = useScrollTracker(sectionIds)

  const serverVersion = (manifest as { serverVersion: string }).serverVersion

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        companySlug={companySlug}
        onCompanySlugChange={setCompanySlug}
        serverVersion={serverVersion}
        onMenuClick={() => setShowMobileSidebar(!showMobileSidebar)}
      />
      <div className="flex max-w-7xl mx-auto">
        <Sidebar
          sections={sections}
          activeSectionId={activeSectionId}
          mobileOpen={showMobileSidebar}
          onMobileClose={() => setShowMobileSidebar(false)}
        />
        <main className="flex-1 px-6 py-8 space-y-12 min-w-0">
          {sections.map((section) => (
            <div key={section.id}>
              <GuideSection section={section} companySlug={companySlug} />
              {section.id === 'what-can-it-do' && <ToolCatalog mode="overview" />}
              {section.id === 'setup-stdio' && <ConfigPanel companySlug={companySlug} />}
              {section.id === 'tools-reference' && <ToolCatalog mode="detail" />}
            </div>
          ))}
        </main>
      </div>
    </div>
  )
}
