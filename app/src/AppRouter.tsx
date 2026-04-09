import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { RoleGuard } from './components/common/RoleGuard'
import { AdminLayout } from './components/layout/AdminLayout'
import { AppLayout } from './components/layout/AppLayout'
import { LandingPage } from './pages/LandingPage'
import { AdminCoursesPage } from './pages/admin/AdminCoursesPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminReportsPage } from './pages/admin/AdminReportsPage'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { CourseDetailPage } from './pages/learner/CourseDetailPage'
import { CoursePlayerPage } from './pages/learner/CoursePlayerPage'
import { CoursesPage } from './pages/learner/CoursesPage'
import { HomePage } from './pages/learner/HomePage'
import { MyLearningPage } from './pages/learner/MyLearningPage'
import { QuizPage } from './pages/learner/QuizPage'
import { WebinarsPage } from './pages/learner/WebinarsPage'
import type { UserRole } from './types'

const learnerRoles: UserRole[] = ['learner', 'instructor', 'content_admin', 'hr_admin', 'super_admin']
const adminRoles: UserRole[] = ['instructor', 'content_admin', 'hr_admin', 'super_admin']
const courseAdminRoles: UserRole[] = ['instructor', 'content_admin', 'super_admin']
const userAdminRoles: UserRole[] = ['hr_admin', 'super_admin']

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

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
        <Route path="/webinars" element={<WebinarsPage />} />
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
              <AdminCoursesPage />
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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
