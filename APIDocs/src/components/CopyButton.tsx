import { useState, useCallback } from 'react'
import { useLocaleContext } from '../hooks/useLocale'

interface CopyButtonProps {
  text: string
  className?: string
}

export function CopyButton({ text, className = '' }: CopyButtonProps) {
  const { t } = useLocaleContext()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
        copied
          ? 'text-green-700 bg-green-100'
          : 'hover:bg-black/5'
      } ${className}`}
      style={!copied ? { color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' } : undefined}
    >
      {copied ? t('copy.done') : t('copy.button')}
    </button>
  )
}
