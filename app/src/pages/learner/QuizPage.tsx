import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { REQUIRED_PASSING_SCORE } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'
import { getLatestPassedAttempt, toDateLabel } from '../../lib/courseLogic'
import type { QuizAttempt } from '../../types'

export function QuizPage() {
  const { courseId = '' } = useParams()
  const { currentUserId, courses, getActiveEnrollment, submitQuizAttempt } = useAppStore()
  const course = courses.find((entry) => entry.id === courseId)
  const enrollment = getActiveEnrollment(currentUserId, courseId)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [justPassedAttempt, setJustPassedAttempt] = useState<QuizAttempt | null>(null)

  const currentQuestion = useMemo(() => {
    if (!course) return null
    return course.quiz[currentIndex] ?? null
  }, [course, currentIndex])

  const displayOptions = useMemo(() => {
    if (!currentQuestion) return []
    if (currentQuestion.options.length >= 4) return currentQuestion.options

    const fallbackLabels = ['None of the above', 'All of the above', 'Insufficient information']
    const additionalOptionsNeeded = 4 - currentQuestion.options.length
    const fallbackOptions = Array.from({ length: additionalOptionsNeeded }, (_, index) => ({
      id: `fallback-${currentQuestion.id}-${index + 1}`,
      label: fallbackLabels[index] ?? `Choice ${currentQuestion.options.length + index + 1}`,
      isCorrect: false,
    }))
    return [...currentQuestion.options, ...fallbackOptions]
  }, [currentQuestion])

  if (!course || !currentQuestion) {
    return (
      <section className="empty-state">
        <h1>Course quiz not found</h1>
        <Link to="/courses">Back to courses</Link>
      </section>
    )
  }

  if (!enrollment) {
    return (
      <section className="empty-state">
        <h1>Enroll before attempting quiz</h1>
        <Link to={`/courses/${course.id}`}>Go to course details</Link>
      </section>
    )
  }

  const latestPassedAttempt = getLatestPassedAttempt(enrollment.quizAttempts)
  const passedAttempt = justPassedAttempt ?? latestPassedAttempt
  const canSubmit = Object.keys(answers).length === course.quiz.length
  const selected = answers[currentQuestion.id]

  return (
    <section className="page-stack quiz-page">
      <header className="page-header page-header--split">
        <h1>{course.title}</h1>
        <p className="page-subtitle">
          One question at a time. Pass threshold: {REQUIRED_PASSING_SCORE}%. Retakes are unlimited.
        </p>
      </header>

      {passedAttempt ? (
        <article className="simple-card stack quiz-pass-card">
          <p className="eyebrow">Quiz complete</p>
          <h2>Passed with {passedAttempt.scorePercent}%</h2>
          <p className="muted">
            Submitted on {toDateLabel(passedAttempt.submittedAt)}. You can revisit this quiz any time.
          </p>
          <div className="button-row">
            <Link className="btn-primary" to={`/courses/${course.id}`}>
              Back to course
            </Link>
            <Link className="btn-secondary" to="/my-learning">
              Go to My Learning
            </Link>
          </div>
        </article>
      ) : (
        <article className="quiz-shell">
          <div className="quiz-progress">
            <p className="eyebrow">Question {currentIndex + 1}</p>
            <p className="muted">of {course.quiz.length}</p>
          </div>
          <h2>{currentQuestion.prompt}</h2>
          <div className="quiz-options">
            {displayOptions.map((option, optionIndex) => (
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
                <span className="option-choice">{`${String.fromCharCode(97 + optionIndex)})`}</span>
                <span>{option.label}</span>
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
                if (attempt.passed) {
                  setJustPassedAttempt(attempt)
                  setResultMessage(null)
                  return
                }
                setResultMessage(
                  `Scored ${attempt.scorePercent}%. Pass mark is ${REQUIRED_PASSING_SCORE}%.`,
                )
              }}
            >
              Submit attempt
            </button>
          </div>
          {resultMessage ? <p className="muted">{resultMessage}</p> : null}
        </article>
      )}

      <article className="quiz-history">
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
