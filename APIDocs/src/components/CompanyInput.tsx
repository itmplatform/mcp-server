import { useLocaleContext } from '../hooks/useLocale'

interface CompanyInputProps {
  value: string
  onChange: (slug: string) => void
}

export function CompanyInput({ value, onChange }: CompanyInputProps) {
  const { t } = useLocaleContext()

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('header.companyPlaceholder')}
      aria-label={t('header.companyPlaceholder')}
      className="w-32 px-2 py-1 text-sm rounded bg-white/20 text-white placeholder-white/60 border border-white/30 focus:outline-none focus:border-white/60 transition-colors"
    />
  )
}
