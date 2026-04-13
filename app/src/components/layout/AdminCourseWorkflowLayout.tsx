import { Link, Outlet, useLocation } from 'react-router-dom'

type WorkflowStep = {
  id: 'upload' | 'draft' | 'review' | 'published'
  label: string
  to: string
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 'upload', label: 'Upload', to: '/admin/courses/new' },
  { id: 'draft', label: 'Draft prep', to: '/admin/courses/drafts' },
  { id: 'review', label: 'Review', to: '/admin/courses/review' },
  { id: 'published', label: 'Published', to: '/admin/courses/published' },
]

function getActiveStepId(pathname: string): WorkflowStep['id'] | null {
  if (pathname.startsWith('/admin/courses/new')) return 'upload'
  if (pathname.startsWith('/admin/courses/drafts')) return 'draft'
  if (/^\/admin\/courses\/[^/]+\/quiz-bank\/?$/.test(pathname)) return 'draft'
  if (pathname.startsWith('/admin/courses/review')) return 'review'
  if (pathname.startsWith('/admin/courses/published')) return 'published'
  return null
}

export function AdminCourseWorkflowLayout() {
  const location = useLocation()
  const activeStepId = getActiveStepId(location.pathname)

  return (
    <section className="course-workflow-shell">
      <nav className="course-workflow-steps" aria-label="Course creation workflow">
        {WORKFLOW_STEPS.map((step, index) => {
          const isCurrent = activeStepId === step.id
          return (
            <Link
              key={step.id}
              to={step.to}
              className={`course-workflow-step${isCurrent ? ' is-current' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="course-workflow-step__index">Step {index + 1}</span>
              <span className="course-workflow-step__label">{step.label}</span>
            </Link>
          )
        })}
      </nav>
      <Outlet />
    </section>
  )
}
