import { JourneyHubPage, type JourneyHubCard } from '../../components/common/JourneyHubPage'
import { useReportingData } from './reportingData'

export function AdminReportsPage() {
  const { snapshot, completionByCourse, progressRows } = useReportingData()
  const cards: JourneyHubCard[] = [
    {
      eyebrow: 'Snapshot',
      title: 'Operational KPIs',
      description: 'Usage, compliance, and live-session pipeline in one top-level view.',
      meta: `${snapshot.totalUsers} users · ${snapshot.totalCompletions} completions · ${snapshot.cpdLedgerEntries} ledger entries`,
      to: '/admin/reports/snapshot',
      cta: 'Open snapshot report',
    },
    {
      eyebrow: 'Course performance',
      title: 'Completion rates',
      description: 'See completion percentage by course for quality and pacing decisions.',
      meta: `${completionByCourse.length} courses in the completion table.`,
      to: '/admin/reports/completions',
      cta: 'Open completion report',
    },
    {
      eyebrow: 'Learner QA',
      title: 'Progress monitor',
      description: 'Track watched percentages, attempt counts, and latest assessment scores.',
      meta: `${progressRows.length} active learner-course progress rows.`,
      to: '/admin/reports/progress',
      cta: 'Open learner progress report',
    },
  ]

  return (
    <JourneyHubPage
      sectionClassName="page page--admin"
      headerEyebrow="Admin · Reporting"
      headerTitle="Reporting sitemap"
      headerSubtitle="This page has one objective: route you to the right report for the question at hand."
      cards={cards}
    />
  )
}
