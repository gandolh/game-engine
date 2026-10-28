/**
 * Card + CardGrid — stand-ins for Starlight's components of the same names, so a
 * migrated page keeps its markup:
 *
 *   import { Card, CardGrid } from '@site/src/components/Cards'
 *   <CardGrid>
 *     <Card title="Narrative">Rendered from the corpus.</Card>
 *     <Card title="Reference" href="/reference/">Generated from the code.</Card>
 *   </CardGrid>
 *
 * Starlight's `icon` prop has no equivalent and is dropped; `href` makes the
 * whole card a link (Starlight's LinkCard). Styling hooks are `.doc-card*` in
 * src/css/custom.css, so each project frames cards in its own language.
 */
import type { ReactNode } from 'react'
import Link from '@docusaurus/Link'

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="doc-card-grid">{children}</div>
}

interface CardProps {
  title: string
  href?: string
  children?: ReactNode
}

export function Card({ title, href, children }: CardProps) {
  const body = (
    <>
      <p className="doc-card__title">{title}</p>
      {children && <div className="doc-card__body">{children}</div>}
    </>
  )
  return href ? (
    <Link className="doc-card doc-card--link" to={href}>
      {body}
    </Link>
  ) : (
    <div className="doc-card">{body}</div>
  )
}
