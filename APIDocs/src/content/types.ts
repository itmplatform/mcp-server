export interface GuideSection {
  id: string
  title: string
  content: string
  track: 'end-user' | 'developer'
}

export type Locale = 'en' | 'es'

export const SECTION_ORDER = [
  'what-can-it-do',
  'setup-overview',
  'setup-stdio',
  'setup-oauth',
  'ai-clients',
  'write-operations',
  'access-control',
  'revoke-and-audit',
  'faq',
  'tools-reference',
  'resources',
  'authentication',
  'self-hosting',
  'troubleshooting',
  'changelog',
] as const

export type SectionId = (typeof SECTION_ORDER)[number]

const END_USER_SECTIONS: ReadonlySet<string> = new Set([
  'what-can-it-do',
  'setup-overview',
  'setup-stdio',
  'setup-oauth',
  'ai-clients',
  'write-operations',
  'access-control',
  'revoke-and-audit',
  'faq',
])

export function getSectionTrack(id: string): 'end-user' | 'developer' {
  return END_USER_SECTIONS.has(id) ? 'end-user' : 'developer'
}
