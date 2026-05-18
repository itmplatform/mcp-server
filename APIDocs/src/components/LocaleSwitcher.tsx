import { useLocaleContext } from '../hooks/useLocale'
import type { Locale } from '../content/types'

const LOCALES: Locale[] = ['en', 'es']

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocaleContext()

  const handleClick = () => {
    const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length]
    setLocale(next)
  }

  return (
    <button
      onClick={handleClick}
      aria-label="Language"
      className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-white/30 hover:border-white/60 transition-colors text-sm font-semibold text-white"
    >
      {t(`locale.${locale}`)}
    </button>
  )
}
