import { Link } from 'react-router-dom'

type JourneyTaskFooterProps = {
  backTo: string
  backLabel: string
  nextTo?: string
  nextLabel?: string
}

export function JourneyTaskFooter({ backTo, backLabel, nextTo, nextLabel }: JourneyTaskFooterProps) {
  return (
    <footer className="button-row journey-task-footer">
      <Link className="link-button" to={backTo}>
        {backLabel}
      </Link>
      {nextTo && nextLabel ? (
        <Link className="link-button" to={nextTo}>
          {nextLabel}
        </Link>
      ) : null}
    </footer>
  )
}
