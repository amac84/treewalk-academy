import { calculateCPDHours } from '../lib/cpd'
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

const users: User[] = [
  {
    id: 'u-learner-1',
    name: 'Alex Chen, CPA',
    email: 'alex.chen@treewalk.test',
    role: 'learner',
    status: 'active',
    invitedAt: isoDaysAgo(35),
    joinedAt: isoDaysAgo(34),
  },
  {
    id: 'u-learner-2',
    name: 'Priya Singh, CPA',
    email: 'priya.singh@treewalk.test',
    role: 'learner',
    status: 'active',
    invitedAt: isoDaysAgo(21),
    joinedAt: isoDaysAgo(19),
  },
  {
    id: 'u-instructor-1',
    name: 'Jordan Williams, CPA',
    email: 'jordan.williams@treewalk.test',
    role: 'instructor',
    status: 'active',
    invitedAt: isoDaysAgo(90),
    joinedAt: isoDaysAgo(88),
  },
  {
    id: 'u-content-admin',
    name: 'Sam Rivera',
    email: 'sam.rivera@treewalk.test',
    role: 'content_admin',
    status: 'active',
    invitedAt: isoDaysAgo(100),
    joinedAt: isoDaysAgo(98),
  },
  {
    id: 'u-hr-admin',
    name: 'Morgan Lee',
    email: 'morgan.lee@treewalk.test',
    role: 'hr_admin',
    status: 'active',
    invitedAt: isoDaysAgo(100),
    joinedAt: isoDaysAgo(98),
  },
  {
    id: 'u-super',
    name: 'Taylor Brooks',
    email: 'taylor.brooks@treewalk.test',
    role: 'super_admin',
    status: 'active',
    invitedAt: isoDaysAgo(120),
    joinedAt: isoDaysAgo(118),
  },
]

const invites: Invite[] = [
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

const courses: Course[] = [
  {
    id: 'course-ethics-2026',
    title: 'Ethics in Public Practice 2026',
    summary: 'Defensible ethics decisions in high-risk accounting scenarios.',
    description:
      'A practical ethics refresher focused on high-risk decision points and defensible documentation.',
    category: 'Ethics',
    topic: 'Ethics',
    level: 'intermediate',
    instructorId: 'u-instructor-1',
    status: 'published',
    videoMinutes: 96,
    segments: [
      { id: 'seg-ethics-1', title: 'Bias traps in evidence review', durationMinutes: 16, order: 1 },
      { id: 'seg-ethics-2', title: 'Escalation and documentation', durationMinutes: 18, order: 2 },
      { id: 'seg-ethics-3', title: 'Threat categories refresher', durationMinutes: 20, order: 3 },
      { id: 'seg-ethics-4', title: 'Safeguard design workshop', durationMinutes: 22, order: 4 },
      { id: 'seg-ethics-5', title: 'Case workshop', durationMinutes: 20, order: 5 },
    ],
    quiz: [
      {
        id: 'q-ethics-1',
        prompt: 'Which step best supports defensible professional judgment?',
        options: [
          { id: 'a', label: 'Relying on prior year treatment only', isCorrect: false },
          { id: 'b', label: 'Documenting alternatives and rationale', isCorrect: true },
          { id: 'c', label: 'Prioritizing client preference over evidence', isCorrect: false },
        ],
      },
      {
        id: 'q-ethics-2',
        prompt: 'Which safeguard is strongest for independence threats?',
        options: [
          { id: 'a', label: 'No safeguard if workload is high', isCorrect: false },
          { id: 'b', label: 'Independent review and documented approvals', isCorrect: true },
          { id: 'c', label: 'Verbal acknowledgement only', isCorrect: false },
        ],
      },
    ],
    version: 1,
    createdAt: isoDaysAgo(42),
    updatedAt: isoDaysAgo(3),
    publishedAt: isoDaysAgo(16),
  },
  {
    id: 'course-tax-updates',
    title: 'Tax Update Intensive: 2026 Q1',
    summary: 'Regulatory updates with practical filing and advisory impact.',
    description:
      'A concise breakdown of regulatory updates and practical impact on filings and advisory.',
    category: 'Tax',
    topic: 'Tax',
    level: 'advanced',
    instructorId: 'u-instructor-1',
    status: 'published',
    videoMinutes: 72,
    segments: [
      { id: 'seg-tax-1', title: 'Legislative highlights', durationMinutes: 18, order: 1 },
      { id: 'seg-tax-2', title: 'Agency guidance changes', durationMinutes: 15, order: 2 },
      { id: 'seg-tax-3', title: 'Client communication updates', durationMinutes: 19, order: 3 },
      { id: 'seg-tax-4', title: 'Worked examples', durationMinutes: 20, order: 4 },
    ],
    quiz: [
      {
        id: 'q-tax-1',
        prompt: 'What is the best first action after material tax change?',
        options: [
          { id: 'a', label: 'Update client advisory notes and filing playbooks', isCorrect: true },
          { id: 'b', label: 'Delay updates to next quarter', isCorrect: false },
          { id: 'c', label: 'Communicate informally with no tracking', isCorrect: false },
        ],
      },
    ],
    version: 1,
    createdAt: isoDaysAgo(30),
    updatedAt: isoDaysAgo(2),
    publishedAt: isoDaysAgo(9),
  },
  {
    id: 'course-ai-controls',
    title: 'AI Controls & Governance for CPA Teams',
    summary: 'Control design and evidence patterns for AI-assisted operations.',
    description:
      'Control design, oversight models, and documentation standards for AI-enabled accounting operations.',
    category: 'Technology',
    topic: 'Technology',
    level: 'beginner',
    instructorId: 'u-instructor-1',
    status: 'review',
    videoMinutes: 58,
    segments: [
      { id: 'seg-ai-1', title: 'Control objectives', durationMinutes: 15, order: 1 },
      { id: 'seg-ai-2', title: 'Responsibility matrix', durationMinutes: 13, order: 2 },
      { id: 'seg-ai-3', title: 'Monitoring loops', durationMinutes: 14, order: 3 },
      { id: 'seg-ai-4', title: 'Evidence packs', durationMinutes: 16, order: 4 },
    ],
    quiz: [
      {
        id: 'q-ai-1',
        prompt: 'Which control objective is foundational?',
        options: [
          { id: 'a', label: 'Undefined accountability', isCorrect: false },
          { id: 'b', label: 'Traceable decisions and oversight', isCorrect: true },
          { id: 'c', label: 'No monitoring baseline', isCorrect: false },
        ],
      },
    ],
    version: 1,
    createdAt: isoDaysAgo(26),
    updatedAt: isoDaysAgo(1),
  },
  {
    id: 'course-advisory-narratives',
    title: 'Advisory Storytelling for CFO Conversations',
    summary: 'CFO-facing communication patterns for actionable insight.',
    description:
      'How to present financial insight clearly, credibly, and actionably to executive audiences.',
    category: 'Advisory',
    topic: 'Leadership',
    level: 'intermediate',
    instructorId: 'u-instructor-1',
    status: 'draft',
    videoMinutes: 44,
    segments: [
      { id: 'seg-adv-1', title: 'Decision-first framing', durationMinutes: 12, order: 1 },
      { id: 'seg-adv-2', title: 'Tradeoff language', durationMinutes: 11, order: 2 },
      { id: 'seg-adv-3', title: 'Board-ready visuals', durationMinutes: 10, order: 3 },
      { id: 'seg-adv-4', title: 'Action-oriented close', durationMinutes: 11, order: 4 },
    ],
    quiz: [
      {
        id: 'q-adv-1',
        prompt: 'Strong advisory communication should end with:',
        options: [
          { id: 'a', label: 'an explicit recommendation and next step', isCorrect: true },
          { id: 'b', label: 'a broad summary only', isCorrect: false },
          { id: 'c', label: 'raw data with no interpretation', isCorrect: false },
        ],
      },
    ],
    version: 1,
    createdAt: isoDaysAgo(20),
    updatedAt: isoDaysAgo(1),
  },
]

const enrollments: Enrollment[] = [
  {
    id: 'enr-1',
    userId: 'u-learner-1',
    courseId: 'course-ethics-2026',
    enrolledAt: isoDaysAgo(14),
    watchedSegmentIds: ['seg-ethics-1', 'seg-ethics-2', 'seg-ethics-3'],
    watchedMinutes: 54,
    quizAttempts: [],
  },
  {
    id: 'enr-2',
    userId: 'u-learner-2',
    courseId: 'course-tax-updates',
    enrolledAt: isoDaysAgo(11),
    completedAt: isoDaysAgo(7),
    certificateId: 'cert-u-learner-2-course-tax-updates',
    watchedSegmentIds: ['seg-tax-1', 'seg-tax-2', 'seg-tax-3', 'seg-tax-4'],
    watchedMinutes: 72,
    quizAttempts: [],
  },
]

const webinars: Webinar[] = [
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
    convertedCourseId: 'course-tax-updates',
    attendeeIds: ['u-learner-2'],
    provider: 'Microsoft Teams',
    externalEventId: 'tw-yec-2025',
  },
]

export const initialState: AppState = {
  users,
  invites,
  courses,
  enrollments,
  progress: {},
  completions: [
    {
      id: 'comp-1',
      userId: 'u-learner-2',
      courseId: 'course-tax-updates',
      completionDate: isoDaysAgo(7),
      cpdHours: calculateCPDHours(72),
      quizAttemptId: 'seed-pass-1',
      certificateId: 'cert-u-learner-2-course-tax-updates',
      courseVersion: 1,
    },
  ],
  certificates: [
    {
      id: 'cert-u-learner-2-course-tax-updates',
      userId: 'u-learner-2',
      courseId: 'course-tax-updates',
      verificationCode: 'TW-CERT-8821',
      issuedAt: isoDaysAgo(7),
    },
  ],
  webinars,
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
  cpdLedger: [
    {
      id: 'cpd-1',
      userId: 'u-learner-2',
      courseId: 'course-tax-updates',
      completionId: 'comp-1',
      hoursAwarded: calculateCPDHours(72),
      createdAt: isoDaysAgo(7),
    },
  ],
  auditEvents: [],
  transcript: [
    {
      id: 'tr-1',
      userId: 'u-learner-2',
      courseId: 'course-tax-updates',
      courseTitle: 'Tax Update Intensive: 2026 Q1',
      completedAt: isoDaysAgo(7),
      cpdHours: calculateCPDHours(72),
      certificateId: 'cert-u-learner-2-course-tax-updates',
    },
  ],
}
