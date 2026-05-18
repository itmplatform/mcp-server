import { ThemeToggle } from './ThemeToggle'
import { LocaleSwitcher } from './LocaleSwitcher'
import { CompanyInput } from './CompanyInput'
import { useLocaleContext } from '../hooks/useLocale'
import type { ThemeMode } from '../hooks/useTheme'

interface HeaderProps {
  theme: ThemeMode
  onToggleTheme: () => void
  companySlug: string
  onCompanySlugChange: (slug: string) => void
  serverVersion: string
  onMenuClick?: () => void
}

export function Header({ theme, onToggleTheme, companySlug, onCompanySlugChange, serverVersion, onMenuClick }: HeaderProps) {
  const { t } = useLocaleContext()
  return (
    <header role="banner" className="sticky top-0 z-40 bg-itm-primary text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="Menu"
            className="md:hidden p-1 rounded hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img
            src="./assets/LOGO-ITM-PLATFORM-horizontal-mark-name-line-square-white.svg"
            alt="ITM Platform"
            className="h-8"
          />
          <h1 className="text-lg font-semibold hidden sm:block">{t('header.title')}</h1>
          {serverVersion && (
            <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-mono rounded bg-white/20">
              v{serverVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CompanyInput value={companySlug} onChange={onCompanySlugChange} />
          <LocaleSwitcher />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  )
}
