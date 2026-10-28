/**
 * Hero — the stand-in for Starlight's `template: splash` + `hero:` frontmatter.
 * Put it at the top of `src/pages/index.mdx` (a page, so no docs sidebar —
 * which is what splash meant):
 *
 *   import Hero from '@site/src/components/Hero'
 *   <Hero
 *     title="ImbatranimOS"
 *     tagline={<>One <code>docker run</code>. A real Alpine userland.</>}
 *     actions={[
 *       { text: 'Take the tour', link: '/tour/', variant: 'primary' },
 *       { text: 'Architecture', link: '/architecture/', variant: 'minimal' },
 *     ]}
 *   />
 *
 * Starlight's `variant` maps onto Infima buttons: primary → button--primary,
 * secondary → button--secondary, minimal → a plain link. Starlight's `icon`
 * has no equivalent and is dropped. Styling hooks are `.doc-hero*`.
 */
import type { ReactNode } from 'react'
import Link from '@docusaurus/Link'
import Heading from '@theme/Heading'

interface Action {
  text: string
  link: string
  variant?: 'primary' | 'secondary' | 'minimal'
}

interface Props {
  title: string
  tagline?: ReactNode
  actions?: Action[]
}

const variantClass = {
  primary: 'button button--primary button--lg',
  secondary: 'button button--secondary button--lg',
  minimal: 'doc-hero__minimal',
}

export default function Hero({ title, tagline, actions = [] }: Props) {
  return (
    <header className="doc-hero">
      <Heading as="h1" className="doc-hero__title">
        {title}
      </Heading>
      {tagline && <p className="doc-hero__tagline">{tagline}</p>}
      {actions.length > 0 && (
        <div className="doc-hero__actions">
          {actions.map((a) => (
            <Link key={a.text} className={variantClass[a.variant ?? 'primary']} to={a.link}>
              {a.text}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
