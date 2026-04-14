import type { UserRole } from '../types'

export type RoleReferenceItem = {
  role: UserRole
  label: string
  summary: string
}

/** In-app copy for admins choosing or interpreting roles (kept in sync with routing + store gates). */
export const ROLE_REFERENCE_ITEMS: RoleReferenceItem[] = [
  {
    role: 'learner',
    label: 'Learner',
    summary:
      'Uses the learning app only: home, course catalog, my learning, webinars, and quizzes. No admin areas.',
  },
  {
    role: 'instructor',
    label: 'Instructor',
    summary:
      'Learner access plus course admin for their own courses: create drafts, edit details, add segments and video, submit to review. Cannot publish or change who owns a course. Can open admin reports.',
  },
  {
    role: 'content_admin',
    label: 'Content admin',
    summary:
      'Full course workflow on all courses: edit anything, reassign instructor, move draft → review → published (and back). Learner pages and admin reports. Cannot issue invites or suspend users (HR handles that).',
  },
  {
    role: 'hr_admin',
    label: 'HR admin',
    summary:
      'People operations: issue invites, suspend or reactivate users, admin dashboard and reports. No course authoring screens under /admin/courses. Can still use learner-facing pages.',
  },
  {
    role: 'super_admin',
    label: 'Super admin',
    summary: 'Everything content admins and HR admins can do, including all courses and all people controls.',
  },
]

export function formatRoleLabel(role: UserRole): string {
  return role.replaceAll('_', ' ')
}
