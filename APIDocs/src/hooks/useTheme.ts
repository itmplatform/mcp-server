import { useState, useCallback, useEffect } from 'react'
import { STORAGE_KEYS } from '../utils/constants'

export type ThemeMode = 'light' | 'dark' | 'system'

const CYCLE: ThemeMode[] = ['system', 'light', 'dark']

function getResolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.THEME) as ThemeMode | null
    return stored && CYCLE.includes(stored) ? stored : 'system'
  })

  useEffect(() => {
    const resolved = getResolvedTheme(theme)
    document.documentElement.setAttribute('data-theme', resolved)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const idx = CYCLE.indexOf(prev)
      const next = CYCLE[(idx + 1) % CYCLE.length]
      localStorage.setItem(STORAGE_KEYS.THEME, next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
