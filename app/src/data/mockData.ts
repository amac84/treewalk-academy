/**
 * MOCK DATA — synthetic users / invites / webinars for local demos only.
 *
 * Course catalog seeds were removed; real courses come from Supabase (`academy_courses`).
 * When that table is empty, nothing is auto-seeded from here.
 */

import type {
  AppState,
  Course,
  Enrollment,
  Invite,
  User,
  Webinar,
} from '../types'

const isoDaysAgo = (daysAgo: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

const isoDaysFromNow = (daysFromNow: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  return date.toISOString()
}

const mockUsers: User[] = [
  {
    id: 'u-learner-1',
    name: 'Alex Chen, CPA',
    email: 'alex.chen@treewalk.test',
    role: 'learner',
    accessScope: 'internal',
    status: 'active',
    invitedAt: isoDaysAgo(35),
    joinedAt: isoDaysAgo(34),
  },
  {
    id: 'u-learner-2',
    name: 'Priya Singh, CPA',
    email: 'priya.singh@treewalk.test',
    role: 'learner',
    accessScope: 'internal',
    status: 'active',
    invitedAt: isoDaysAgo(21),
    joinedAt: isoDaysAgo(19),
  },
  {
    id: 'u-instructor-1',
    name: 'Jordan Williams, CPA',
    email: 'jordan.williams@treewalk.test',
    role: 'instructor',
    accessScope: 'internal',
    status: 'active',
    invitedAt: isoDaysAgo(90),
    joinedAt: isoDaysAgo(88),
  },
  {
    id: 'u-content-admin',
    name: 'Sam Rivera',
    email: 'sam.rivera@treewalk.test',
    role: 'content_admin',
    accessScope: 'internal',
    status: 'active',
    invitedAt: isoDaysAgo(100),
    joinedAt: isoDaysAgo(98),
  },
  {
    id: 'u-hr-admin',
    name: 'Morgan Lee',
    email: 'morgan.lee@treewalk.test',
    role: 'hr_admin',
    accessScope: 'internal',
    status: 'active',
    invitedAt: isoDaysAgo(100),
    joinedAt: isoDaysAgo(98),
  },
  {
    id: 'u-super',
    name: 'Taylor Brooks',
    email: 'taylor.brooks@treewalk.test',
    role: 'super_admin',
    accessScope: 'internal',
    status: 'active',
    invitedAt: isoDaysAgo(120),
    joinedAt: isoDaysAgo(118),
  },
  {
    id: 'u-external-learner',
    name: 'Jamie Guest',
    email: 'jamie.guest@example.com',
    role: 'learner',
    accessScope: 'external',
    status: 'active',
    invitedAt: isoDaysAgo(5),
    joinedAt: isoDaysAgo(4),
  },
]

const mockInvites: Invite[] = [
  {
    id: 'inv-1',
    email: 'new.cpa@treewalk.test',
    role: 'learner',
    code: 'INV-3YRCPD',
    status: 'pending',
    createdByUserId: 'u-hr-admin',
    createdAt: isoDaysAgo(1),
  },
]

const mockCourses: Course[] = []

const mockEnrollments: Enrollment[] = []

const mockWebinars: Webinar[] = [
  {
    id: 'webinar-q2-planning',
    title: 'Q2 Planning Roundtable for Practice Leaders',
    description: 'Live Teams session on planning priorities and firm operating cadence.',
    startAt: isoDaysFromNow(5),
    teamsJoinUrl: 'https://teams.microsoft.com/l/meetup-join/treewalk-q2',
    status: 'upcoming',
    convertedCourseId: null,
    attendeeIds: ['u-learner-1'],
    provider: 'Microsoft Teams',
    externalEventId: 'tw-q2-2026',
  },
  {
    id: 'webinar-year-end-close',
    title: 'Year-End Close Failure Patterns',
    description: 'Common close-cycle breakdowns and remediation patterns.',
    startAt: isoDaysAgo(370),
    teamsJoinUrl: 'https://teams.microsoft.com/l/meetup-join/treewalk-close',
    status: 'completed',
    convertedCourseId: null,
    attendeeIds: ['u-learner-2'],
    provider: 'Microsoft Teams',
    externalEventId: 'tw-yec-2025',
  },
]

export const mockInitialState: AppState = {
  users: mockUsers,
  invites: mockInvites,
  courses: mockCourses,
  removedCatalogCourseIds: [],
  enrollments: mockEnrollments,
  progress: {},
  completions: [],
  certificates: [],
  webinars: mockWebinars,
  webinarAttendances: [
    {
      id: 'wa-1',
      webinarId: 'webinar-q2-planning',
      userId: 'u-learner-1',
      attendedAt: isoDaysAgo(1),
    },
    {
      id: 'wa-2',
      webinarId: 'webinar-year-end-close',
      userId: 'u-learner-2',
      attendedAt: isoDaysAgo(370),
    },
  ],
  cpdLedger: [],
  auditEvents: [],
  transcript: [],
  learningActivityLog: [],
}

/** @alias mockInitialState */
export const initialState = mockInitialState
