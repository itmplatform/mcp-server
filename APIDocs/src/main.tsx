import { createRoot } from 'react-dom/client'
import { LocaleProvider } from './hooks/useLocale'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(<LocaleProvider><App /></LocaleProvider>)
