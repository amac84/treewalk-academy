import { Link, useParams } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { quizOptionBody } from '../../lib/quizOptionLabel'
import { ensureQuizPolicy } from '../../lib/quizPolicy'
import { useCourseWorkflowScope } from './courseWorkflow'

export function AdminCourseQuizBankPage() {
  const { courseId = '' } = useParams()
  const { store, editableCourses } = useCourseWorkflowScope()
  const course = editableCourses.find((entry) => entry.id === courseId)

  if (!course) {
    return (
      <section className="page page-admin page-admin-courses">
        <header className="page-header page-header--compact">
          <p className="section-eyebrow">Admin · Course workflow</p>
          <h1>Quiz bank</h1>
        </header>
        <article className="empty-state">
          <h2>Course not found</h2>
          <p>This quiz bank is unavailable, or you do not have permission to edit it.</p>
          <Link className="link-button" to="/admin/courses/drafts">
            Back to draft prep
          </Link>
        </article>
      </section>
    )
  }

  const policy = ensureQuizPolicy(course)
  const minRequired = Math.max(6, policy.shownQuestionCount)
  const recommendedForVariation = Math.min(60, policy.shownQuestionCount * 2)
  const deletingBlocked = course.quiz.length <= minRequired
  const lowVariationBuffer = course.quiz.length < recommendedForVariation

  return (
    <section className="page page-admin page-admin-courses">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Course workflow</p>
        <h1>Quiz bank moderation</h1>
        <p className="page-subtitle">
          Review generated MCQs and delete weak questions. Manual question authoring is intentionally disabled.
        </p>
      </header>

      <article className="workflow-card stack-sm">
        <h2>{course.title}</h2>
        <p className="meta-line">
          Generated bank: {course.quiz.length} · Questions shown per attempt: {policy.shownQuestionCount} · Pass
          threshold: {policy.passThreshold}%
        </p>
        {deletingBlocked ? (
          <p className="inline-error">
            Deletion is blocked because the bank is already at the minimum required size ({minRequired}).
          </p>
        ) : null}
        {lowVariationBuffer ? (
          <p className="muted">
            Warning: fewer than {recommendedForVariation} questions remain. Retake variety may become weak.
          </p>
        ) : null}
      </article>

      {course.quiz.length === 0 ? (
        <article className="empty-state">
          <h2>No generated questions yet</h2>
          <p>Run transcript drafting again from course creation to build a question bank.</p>
        </article>
      ) : (
        <div className="workflow-list">
          {course.quiz.map((question, index) => {
            const correctOption = question.options.find((option) => option.isCorrect)
            return (
              <article key={question.id} className="workflow-card stack-sm">
                <p className="section-eyebrow">
                  Q{index + 1} · {question.difficulty ?? 'unrated'}
                </p>
                <h3>{question.prompt}</h3>
                <ul className="simple-list">
                  {question.options.map((option, optionIndex) => (
                    <li key={option.id}>
                      <strong>{String.fromCharCode(65 + optionIndex)}.</strong>{' '}
                      {quizOptionBody(option.label)}
                      {option.isCorrect ? ' (correct)' : ''}
                    </li>
                  ))}
                </ul>
                {question.explanation ? <p className="muted">Explanation: {question.explanation}</p> : null}
                <p className="meta-line">
                  Answer key:{' '}
                  {correctOption ? quizOptionBody(correctOption.label) : 'Missing correct option'}
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="button--secondary"
                    disabled={deletingBlocked}
                    onClick={() => {
                      const result = store.deleteCourseQuizQuestion(course.id, question.id)
                      if (!result.ok) {
                        window.alert(result.message ?? 'Could not delete this question.')
                      }
                    }}
                  >
                    Delete question
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <JourneyTaskFooter
        backTo="/admin/courses/drafts"
        backLabel="Back to draft prep"
        nextTo={`/courses/${course.id}`}
        nextLabel="Preview learner course page"
      />
    </section>
  )
}
