import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { REQUIRED_PASSING_SCORE } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'

export function QuizPage() {
  const { courseId = '' } = useParams()
  const { currentUserId, courses, getActiveEnrollment, submitQuizAttempt } = useAppStore()
  const course = courses.find((entry) => entry.id === courseId)
  const enrollment = getActiveEnrollment(currentUserId, courseId)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const currentQuestion = useMemo(() => {
    if (!course) return null
    return course.quiz[currentIndex] ?? null
  }, [course, currentIndex])

  if (!course || !currentQuestion) {
    return (
      <section className="panel">
        <h1>Course quiz not found</h1>
        <Link to="/courses">Back to courses</Link>
      </section>
    )
  }

  if (!enrollment) {
    return (
      <section className="panel">
        <h1>Enroll before attempting quiz</h1>
        <Link to={`/courses/${course.id}`}>Go to course details</Link>
      </section>
    )
  }

  const canSubmit = Object.keys(answers).length === course.quiz.length
  const selected = answers[currentQuestion.id]

  return (
    <section className="page">
      <header className="page-header">
        <h1>{course.title}</h1>
        <p>
          One question at a time. Pass threshold: {REQUIRED_PASSING_SCORE}%. Retakes are unlimited.
        </p>
      </header>

      <article className="panel">
        <p className="muted">
          Question {currentIndex + 1} of {course.quiz.length}
        </p>
        <h2>{currentQuestion.prompt}</h2>
        <div className="quiz-options">
          {currentQuestion.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`option-button ${selected === option.id ? 'selected' : ''}`}
              onClick={() =>
                setAnswers((prev) => ({
                  ...prev,
                  [currentQuestion.id]: option.id,
                }))
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="button-row">
          <button
            type="button"
            className="btn-secondary"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={currentIndex === course.quiz.length - 1}
            onClick={() =>
              setCurrentIndex((value) => Math.min(course.quiz.length - 1, value + 1))
            }
          >
            Next
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit}
            onClick={() => {
              const attempt = submitQuizAttempt(course.id, answers)
              if (!attempt) return
              setResultMessage(
                attempt.passed
                  ? `Passed with ${attempt.scorePercent}%`
                  : `Scored ${attempt.scorePercent}%. Pass mark is ${REQUIRED_PASSING_SCORE}%.`,
              )
            }}
          >
            Submit attempt
          </button>
        </div>
        {resultMessage ? <p className="muted">{resultMessage}</p> : null}
      </article>

      <article className="panel">
        <h2>Attempt history</h2>
        {enrollment.quizAttempts.length === 0 ? (
          <p className="muted">No attempts recorded yet.</p>
        ) : (
          <ul className="attempt-list">
            {enrollment.quizAttempts.map((attempt) => (
              <li key={attempt.id}>
                Attempt {attempt.attemptNumber}: {attempt.scorePercent}% —{' '}
                {attempt.passed ? 'Passed' : 'Not passed'}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}
