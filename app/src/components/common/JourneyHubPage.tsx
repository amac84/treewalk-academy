import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type JourneyHubCard = {
  eyebrow: string
  title: string
  description: string
  meta?: string
  to: string
  cta: string
}

type JourneyHubPageProps = {
  sectionClassName?: string
  headerEyebrow: string
  headerTitle: string
  headerSubtitle: string
  cards: JourneyHubCard[]
  footer?: ReactNode
}

export function JourneyHubPage({
  sectionClassName,
  headerEyebrow,
  headerTitle,
  headerSubtitle,
  cards,
  footer,
}: JourneyHubPageProps) {
  return (
    <section className={sectionClassName ?? 'page'}>
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">{headerEyebrow}</p>
        <h1>{headerTitle}</h1>
        <p className="page-subtitle">{headerSubtitle}</p>
      </header>

      <section className="card-grid">
        {cards.map((card) => (
          <article key={`${card.to}-${card.title}`} className="simple-card stack-sm">
            <p className="section-eyebrow">{card.eyebrow}</p>
            <h2>{card.title}</h2>
            <p className="section-copy">{card.description}</p>
            {card.meta ? <p className="meta-line">{card.meta}</p> : null}
            <Link className="link-button" to={card.to}>
              {card.cta}
            </Link>
          </article>
        ))}
      </section>

      {footer ? <footer className="button-row">{footer}</footer> : null}
    </section>
  )
}
