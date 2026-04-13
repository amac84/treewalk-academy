import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { RoleGuard } from './components/common/RoleGuard'
import { AdminCourseWorkflowLayout } from './components/layout/AdminCourseWorkflowLayout'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppLayout } from './components/layout/AppLayout'
import type { UserRole } from './types'

const learnerRoles: UserRole[] = ['learner', 'instructor', 'content_admin', 'hr_admin', 'super_admin']
const adminRoles: UserRole[] = ['instructor', 'content_admin', 'hr_admin', 'super_admin']
const courseAdminRoles: UserRole[] = ['instructor', 'content_admin', 'super_admin']
const userAdminRoles: UserRole[] = ['hr_admin', 'super_admin']

const DemoAccessPage = lazy(async () => ({ default: (await import('./pages/DemoAccessPage')).DemoAccessPage }))
const LandingPage = lazy(async () => ({ default: (await import('./pages/LandingPage')).LandingPage }))
const AdminCourseCreatePage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminCourseCreatePage')).AdminCourseCreatePage }),
)
const AdminCourseDraftsPage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminCourseDraftsPage')).AdminCourseDraftsPage }),
)
const AdminCourseQuizBankPage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminCourseQuizBankPage')).AdminCourseQuizBankPage }),
)
const AdminCoursePublishedPage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminCoursePublishedPage')).AdminCoursePublishedPage }),
)
const AdminCourseReviewPage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminCourseReviewPage')).AdminCourseReviewPage }),
)
const AdminCoursesPage = lazy(async () => ({ default: (await import('./pages/admin/AdminCoursesPage')).AdminCoursesPage }))
const AdminDashboardPage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminDashboardPage')).AdminDashboardPage }),
)
const AdminReportCompletionsPage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminReportCompletionsPage')).AdminReportCompletionsPage }),
)
const AdminReportLearnerProgressPage = lazy(
  async () => ({
    default: (await import('./pages/admin/AdminReportLearnerProgressPage')).AdminReportLearnerProgressPage,
  }),
)
const AdminReportSnapshotPage = lazy(
  async () => ({ default: (await import('./pages/admin/AdminReportSnapshotPage')).AdminReportSnapshotPage }),
)
const AdminInvitesPage = lazy(async () => ({ default: (await import('./pages/admin/AdminInvitesPage')).AdminInvitesPage }))
const AdminReportsPage = lazy(async () => ({ default: (await import('./pages/admin/AdminReportsPage')).AdminReportsPage }))
const AdminUsersPage = lazy(async () => ({ default: (await import('./pages/admin/AdminUsersPage')).AdminUsersPage }))
const CourseDetailPage = lazy(async () => ({ default: (await import('./pages/learner/CourseDetailPage')).CourseDetailPage }))
const CoursePlayerPage = lazy(async () => ({ default: (await import('./pages/learner/CoursePlayerPage')).CoursePlayerPage }))
const CoursesPage = lazy(async () => ({ default: (await import('./pages/learner/CoursesPage')).CoursesPage }))
const HomePage = lazy(async () => ({ default: (await import('./pages/learner/HomePage')).HomePage }))
const MyLearningExportPage = lazy(
  async () => ({ default: (await import('./pages/learner/MyLearningExportPage')).MyLearningExportPage }),
)
const MyLearningPage = lazy(async () => ({ default: (await import('./pages/learner/MyLearningPage')).MyLearningPage }))
const MyLearningTranscriptPage = lazy(
  async () => ({ default: (await import('./pages/learner/MyLearningTranscriptPage')).MyLearningTranscriptPage }),
)
const QuizPage = lazy(async () => ({ default: (await import('./pages/learner/QuizPage')).QuizPage }))
const WebinarsHistoryPage = lazy(
  async () => ({ default: (await import('./pages/learner/WebinarsHistoryPage')).WebinarsHistoryPage }),
)
const WebinarsUpcomingPage = lazy(
  async () => ({ default: (await import('./pages/learner/WebinarsUpcomingPage')).WebinarsUpcomingPage }),
)
const WebinarsPage = lazy(async () => ({ default: (await import('./pages/learner/WebinarsPage')).WebinarsPage }))

export function AppRouter() {
  return (
    <Suspense
      fallback={
        <section className="page center-empty">
          <p className="muted">Loading page…</p>
        </section>
      }
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo/access" element={<DemoAccessPage />} />

        <Route
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={learnerRoles}>
                <AppLayout />
              </RoleGuard>
            </ProtectedRoute>
          }
        >
          <Route path="/home" element={<HomePage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CourseDetailPage />} />
          <Route path="/courses/:courseId/player" element={<CoursePlayerPage />} />
          <Route path="/courses/:courseId/quiz" element={<QuizPage />} />
          <Route path="/my-learning" element={<MyLearningPage />} />
          <Route path="/my-learning/transcript" element={<MyLearningTranscriptPage />} />
          <Route path="/my-learning/export" element={<MyLearningExportPage />} />
          <Route path="/webinars" element={<WebinarsPage />} />
          <Route path="/webinars/upcoming" element={<WebinarsUpcomingPage />} />
          <Route path="/webinars/history" element={<WebinarsHistoryPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute>
              <RoleGuard allowedRoles={adminRoles}>
                <AdminLayout />
              </RoleGuard>
            </ProtectedRoute>
          }
        >
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route
            path="/admin/courses"
            element={
              <RoleGuard allowedRoles={courseAdminRoles}>
                <AdminCourseWorkflowLayout />
              </RoleGuard>
            }
          >
            <Route index element={<AdminCoursesPage />} />
            <Route path="new" element={<AdminCourseCreatePage />} />
            <Route path="drafts" element={<AdminCourseDraftsPage />} />
            <Route path=":courseId/quiz-bank" element={<AdminCourseQuizBankPage />} />
            <Route path="review" element={<AdminCourseReviewPage />} />
            <Route path="published" element={<AdminCoursePublishedPage />} />
          </Route>
          <Route
            path="/admin/invites"
            element={
              <RoleGuard allowedRoles={userAdminRoles}>
                <AdminInvitesPage />
              </RoleGuard>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RoleGuard allowedRoles={userAdminRoles}>
                <AdminUsersPage />
              </RoleGuard>
            }
          />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
          <Route path="/admin/reports/snapshot" element={<AdminReportSnapshotPage />} />
          <Route path="/admin/reports/completions" element={<AdminReportCompletionsPage />} />
          <Route path="/admin/reports/progress" element={<AdminReportLearnerProgressPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
