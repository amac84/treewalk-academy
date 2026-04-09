import { Link } from 'react-router-dom'
import type { Course } from '../../types'
import { calculateCpdHours } from '../../lib/cpd'

type CourseCardProps = {
  course: Course
}

export function CourseCard({ course }: CourseCardProps) {
  const cpdHours = calculateCpdHours(course.videoMinutes)

  return (
    <article className="course-card">
      <div className="course-card__header">
        <p className="eyebrow">{course.category}</p>
        <span className="course-card__level">{course.level}</span>
      </div>
      <h3>{course.title}</h3>
      <p className="course-card__summary">{course.summary}</p>
      <p className="muted">{course.description}</p>
      <div className="course-card__footer">
        <span>{course.videoMinutes} mins on demand</span>
        <span>{cpdHours.toFixed(2)} CPD</span>
      </div>
      <Link className="text-link course-card__cta" to={`/courses/${course.id}`}>
        Open course
      </Link>
    </article>
  )
}

export function CompletionBadge({ completed }: { completed: boolean }) {
  return (
    <span className={`progress-pill ${completed ? 'progress-pill--complete' : 'progress-pill--pending'}`}>
      {completed ? 'Completed' : 'In Progress'}
    </span>
  )
}
