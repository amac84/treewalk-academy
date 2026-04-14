import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import { learnerCanAccessCourse } from '../../lib/courseAccess'
import { getLatestPassedAttempt, getWatchedPercentFromEnrollment, toDateLabel } from '../../lib/courseLogic'
import { quizOptionBody } from '../../lib/quizOptionLabel'
import { ensureQuizPolicy, selectAttemptQuestions } from '../../lib/quizPolicy'
import type { QuizAttempt } from '../../types'

export function QuizPage() {
  const { courseId = '' } = useParams()
  const { currentUserId, currentUser, courses, getActiveEnrollment, submitQuizAttempt } = useAppStore()
  const course = courses.find((entry) => entry.id === courseId)
  const enrollment = getActiveEnrollment(currentUserId, courseId)
  const policy = course ? ensureQuizPolicy(course) : null
  const watchedPercent = course && enrollment ? getWatchedPercentFromEnrollment(course, enrollment) : 0

  const buildAttemptQuestions = () => {
    if (!course) return []
    const shownCount = ensureQuizPolicy(course).shownQuestionCount
    const seed = `${currentUserId}-${course.id}-${(enrollment?.quizAttempts.length ?? 0) + 1}-${Date.now()}`
    return selectAttemptQuestions(course.quiz, shownCount, seed)
  }

  const [attemptQuestions, setAttemptQuestions] = useState(buildAttemptQuestions)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [justPassedAttempt, setJustPassedAttempt] = useState<QuizAttempt | null>(null)

  useEffect(() => {
    if (!course) return
    setAttemptQuestions(buildAttemptQuestions())
    setCurrentIndex(0)
    setAnswers({})
    setResultMessage(null)
    setJustPassedAttempt(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id])

  const currentQuestion = useMemo(() => {
    if (!course) return null
    return attemptQuestions[currentIndex] ?? null
  }, [course, currentIndex, attemptQuestions])

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

  if (currentUser?.role === 'learner' && !learnerCanAccessCourse(currentUser, course)) {
    return (
      <section className="empty-state">
        <h1>Assessment unavailable</h1>
        <p className="muted">This course is for Treewalk team members only.</p>
        <Link to="/courses">Back to courses</Link>
      </section>
    )
  }

  if (watchedPercent < 100) {
    return (
      <section className="page-stack quiz-page">
        <header className="page-header page-header--split">
          <h1>{course.title}</h1>
          <p className="page-subtitle">
            Finish watching the full course before taking the assessment.
          </p>
        </header>
        <article className="simple-card stack">
          <p className="eyebrow">Assessment locked</p>
          <h2>{watchedPercent}% watched</h2>
          <p className="muted">
            Quiz unlocks at 100% verified watch completion to support CPD evidence quality.
          </p>
          <div className="button-row">
            <Link className="btn-primary" to={`/courses/${course.id}/player`}>
              Return to player
            </Link>
            <Link className="btn-secondary" to={`/courses/${course.id}`}>
              Back to course details
            </Link>
          </div>
        </article>
      </section>
    )
  }

  const latestPassedAttempt = getLatestPassedAttempt(enrollment.quizAttempts)
  const passedAttempt = justPassedAttempt ?? latestPassedAttempt
  const canSubmit = Object.keys(answers).length === attemptQuestions.length
  const selected = answers[currentQuestion.id]

  return (
    <section className="page-stack quiz-page">
      <header className="page-header page-header--split">
        <h1>{course.title}</h1>
        <p className="page-subtitle">
          One question at a time. Pass threshold: {policy?.passThreshold ?? 70}%. Retakes are unlimited.
        </p>
      </header>

      {passedAttempt ? (
        <article className="simple-card stack quiz-pass-card">
          <p className="eyebrow">Quiz complete</p>
          <h2>Passed with {passedAttempt.scorePercent}%</h2>
          <p className="muted">
            Submitted on {toDateLabel(passedAttempt.submittedAt)} — you can revisit this quiz any time.
          </p>
          <div className="button-row">
            <Link className="btn-primary" to={`/courses/${course.id}`}>
              Back to course
            </Link>
            <Link className="btn-secondary" to="/my-learning/transcript">
              Go to My Learning
            </Link>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setAttemptQuestions(buildAttemptQuestions())
                setCurrentIndex(0)
                setAnswers({})
                setResultMessage(null)
                setJustPassedAttempt(null)
              }}
            >
              Start another attempt
            </button>
          </div>
        </article>
      ) : (
        <article className="quiz-shell">
          <div className="quiz-progress">
            <p className="eyebrow">Question {currentIndex + 1}</p>
            <p className="muted">of {attemptQuestions.length}</p>
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
                <span>{quizOptionBody(option.label)}</span>
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
              disabled={currentIndex === attemptQuestions.length - 1}
              onClick={() =>
                setCurrentIndex((value) => Math.min(attemptQuestions.length - 1, value + 1))
              }
            >
              Next
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canSubmit}
              onClick={() => {
                const attempt = submitQuizAttempt(course.id, attemptQuestions, answers)
                if (!attempt) return
                if (attempt.passed) {
                  setJustPassedAttempt(attempt)
                  setResultMessage(null)
                  return
                }
                setResultMessage(
                  `Scored ${attempt.scorePercent}%. Pass mark is ${attempt.passThreshold}%.`,
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
