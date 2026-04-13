import { useMemo } from 'react'
import { useAppStore } from '../../hooks/useAppStore'
import { getWatchedPercentFromEnrollment } from '../../lib/courseLogic'

type CompletionByCourseRow = {
  courseId: string
  title: string
  enrollmentCount: number
  completedCount: number
  completionRate: number
}

type LearnerProgressRow = {
  id: string
  learnerName: string
  courseTitle: string
  watchedPercent: number
  totalAttempts: number
  latestScore: number | null
}

export function useReportingData() {
  const { courses, completions, cpdLedger, users, enrollments, webinars, webinarAttendances } = useAppStore()

  const completionByCourse = useMemo<CompletionByCourseRow[]>(() => {
    return courses
      .map((course) => {
        const enrollmentCount = enrollments.filter((enrollment) => enrollment.courseId === course.id).length
        const completedCount = completions.filter((completion) => completion.courseId === course.id).length
        return {
          courseId: course.id,
          title: course.title,
          enrollmentCount,
          completedCount,
          completionRate: enrollmentCount === 0 ? 0 : Math.round((completedCount / enrollmentCount) * 100),
        }
      })
      .sort((a, b) => b.completionRate - a.completionRate)
  }, [courses, enrollments, completions])

  const progressRows = useMemo<LearnerProgressRow[]>(() => {
    const rows: LearnerProgressRow[] = []
    enrollments.forEach((enrollment) => {
      const course = courses.find((item) => item.id === enrollment.courseId)
      const learner = users.find((item) => item.id === enrollment.userId)
      if (!course || !learner) return
      const latestAttempt = enrollment.quizAttempts[enrollment.quizAttempts.length - 1]
      rows.push({
        id: `${enrollment.userId}-${enrollment.courseId}`,
        learnerName: learner.name,
        courseTitle: course.title,
        watchedPercent: getWatchedPercentFromEnrollment(course, enrollment),
        totalAttempts: enrollment.quizAttempts.length,
        latestScore: latestAttempt ? latestAttempt.scorePercent : null,
      })
    })
    return rows
  }, [enrollments, courses, users])

  const snapshot = useMemo(() => {
    return {
      totalUsers: users.length,
      activeEnrollments: enrollments.length,
      totalCompletions: completions.length,
      totalCourses: courses.length,
      cpdLedgerEntries: cpdLedger.length,
      hoursAwarded: cpdLedger.reduce((sum, row) => sum + row.hoursAwarded, 0),
      certificatesIssued: completions.length,
      totalWebinars: webinars.length,
      attendanceRecords: webinarAttendances.length,
      convertedWebinars: webinars.filter((webinar) => webinar.convertedCourseId).length,
    }
  }, [users.length, enrollments.length, completions.length, courses.length, cpdLedger, webinars, webinarAttendances.length])

  return {
    completionByCourse,
    progressRows,
    snapshot,
  }
}
