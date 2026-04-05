import { Link } from 'react-router-dom'
import type { Course } from '../../types'
import { calculateCpdHours } from '../../lib/cpd'

type CourseCardProps = {
  course: Course
}

export function CourseCard({ course }: CourseCardProps) {
  const cpdHours = calculateCpdHours(course.videoMinutes)

  return (
    <article className="card">
      <div className="card__header">
        <p className="eyebrow">{course.category}</p>
        <span className={`pill pill--status-${course.status.toLowerCase()}`}>
          {course.status}
        </span>
      </div>
      <h3>{course.title}</h3>
      <p className="muted">{course.description}</p>
      <div className="card__footer">
        <span>{course.videoMinutes} mins</span>
        <span>{cpdHours.toFixed(2)} CPD</span>
      </div>
      <Link className="button button--secondary card__cta" to={`/courses/${course.id}`}>
        View course
      </Link>
    </article>
  )
}

export function CompletionBadge({ completed }: { completed: boolean }) {
  return (
    <span className={`pill ${completed ? 'pill--success' : 'pill--warning'}`}>
      {completed ? 'Completed' : 'In Progress'}
    </span>
  )
}
