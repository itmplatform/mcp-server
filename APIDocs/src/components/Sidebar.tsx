import { useLocaleContext } from '../hooks/useLocale'
import type { GuideSection } from '../content/guide-sections'

interface SidebarProps {
  sections: GuideSection[]
  activeSectionId: string
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ sections, activeSectionId, mobileOpen, onMobileClose }: SidebarProps) {
  const { t } = useLocaleContext()

  const endUserSections = sections.filter((s) => s.track === 'end-user')
  const developerSections = sections.filter((s) => s.track === 'developer')

  const renderLink = (s: GuideSection) => (
    <li key={s.id}>
      <a
        href={`#${s.id}`}
        onClick={onMobileClose}
        className={`block px-3 py-1.5 text-sm rounded transition-colors ${
          activeSectionId === s.id
            ? 'text-blue-600 font-medium bg-blue-50'
            : 'hover:bg-black/5'
        }`}
        style={activeSectionId !== s.id ? { color: 'var(--text-secondary)' } : undefined}
      >
        {s.title}
      </a>
    </li>
  )

  const navContent = (
    <>
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {t('sidebar.endUserTrack')}
      </p>
      <ul className="space-y-1 mb-4">
        {endUserSections.map(renderLink)}
      </ul>

      <div className="mx-3 mb-4" style={{ borderTop: '1px solid var(--border-color)' }} />

      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {t('sidebar.developerTrack')}
      </p>
      <ul className="space-y-1">
        {developerSections.map(renderLink)}
      </ul>
    </>
  )

  return (
    <>
      <nav className="w-64 shrink-0 hidden md:block overflow-y-auto sticky top-16 h-[calc(100vh-4rem)] p-4" style={{ borderRight: '1px solid var(--border-color)' }}>
        {navContent}
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <nav className="relative w-64 h-full overflow-y-auto p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
            {navContent}
          </nav>
        </div>
      )}
    </>
  )
}
