export type { GuideSection } from './types'
import type { GuideSection, Locale } from './types'
import { SECTION_ORDER, getSectionTrack } from './types'

const mdModules = import.meta.glob('./sections/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const uiModules = import.meta.glob('./ui/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, Record<string, string>>

function getUiStrings(locale: Locale): Record<string, string> {
  return uiModules[`./ui/${locale}.json`] ?? uiModules['./ui/en.json'] ?? {}
}

function getMdContent(locale: Locale, sectionId: string): string {
  return mdModules[`./sections/${locale}/${sectionId}.md`]
    ?? mdModules[`./sections/en/${sectionId}.md`]
    ?? ''
}

export function getGuideSections(locale: Locale): GuideSection[] {
  const strings = getUiStrings(locale)
  return SECTION_ORDER.map((id) => ({
    id,
    title: strings[`section.${id}`] ?? id,
    content: getMdContent(locale, id),
    track: getSectionTrack(id),
  }))
}
