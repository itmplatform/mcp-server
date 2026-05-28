import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { GuideSection as GuideSectionType } from '../content/guide-sections'

interface GuideSectionProps {
  section: GuideSectionType
  companySlug: string
}

export function GuideSection({ section, companySlug }: GuideSectionProps) {
  const content = companySlug
    ? section.content.replace(/\{your-account\}/g, companySlug)
    : section.content

  return (
    <section id={section.id} className="scroll-mt-20">
      <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
        {section.title}
      </h2>
      <div className="guide-prose text-sm" style={{ color: 'var(--text-secondary)' }}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            a: ({ href, children, ...props }) =>
              href?.startsWith('#') ? (
                <a href={href} {...props}>
                  {children}
                </a>
              ) : (
                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>
              ),
          }}
        >
          {content}
        </Markdown>
      </div>
    </section>
  )
}
