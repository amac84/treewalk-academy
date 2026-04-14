import { useMemo, useState } from 'react'
import { CatalogSyncCallout } from '../../components/common/CatalogSyncCallout'
import { CourseCard } from '../../components/common/CourseCard'
import { useAppStore } from '../../hooks/useAppStore'
import { learnerCanAccessCourse } from '../../lib/courseAccess'
import type { CourseLevel, CourseTopic } from '../../types'

const allTopics: CourseTopic[] = [
  'Tax',
  'Audit',
  'Financial Reporting',
  'Ethics',
  'Technology',
  'Leadership',
  'Advisory',
]

const allLevels: CourseLevel[] = ['beginner', 'intermediate', 'advanced']

export function CoursesPage() {
  const { courses, currentUser } = useAppStore()
  const [topic, setTopic] = useState<CourseTopic | 'All'>('All')
  const [level, setLevel] = useState<CourseLevel | 'All'>('All')
  const [search, setSearch] = useState('')

  const publishedCourses = courses.filter(
    (course) =>
      course.status === 'published' &&
      currentUser !== null &&
      learnerCanAccessCourse(currentUser, course),
  )

  const filteredCourses = useMemo(() => {
    return publishedCourses.filter((course) => {
      const topicMatch = topic === 'All' ? true : course.topic === topic
      const levelMatch = level === 'All' ? true : course.level === level
      const searchMatch =
        search.length < 1
          ? true
          : `${course.title} ${course.description}`.toLowerCase().includes(search.toLowerCase())

      return topicMatch && levelMatch && searchMatch
    })
  }, [publishedCourses, topic, level, search])

  return (
    <section className="page-stack courses-page">
      <CatalogSyncCallout variant="learner" />
      <header className="page-header page-header--split">
        <div>
          <p className="section-eyebrow">Course marketplace</p>
          <h1>Choose the next hour that advances your CPD record.</h1>
          <p className="page-subtitle">
            Filters stay available, but the catalog should do most of the talking through topic,
            level, and earned time.
          </p>
        </div>
        <p className="page-kicker">{filteredCourses.length} courses match your current view.</p>
      </header>

      <section className="filters filters--quiet">
        <div className="filters-intro">
          <h2>Refine the field</h2>
          <p className="section-copy">Use only the filters you need, then return to the titles.</p>
        </div>
        <div className="filters-grid">
          <label>
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by topic, title, or description"
            />
          </label>
          <label>
            Topic
            <select
              value={topic}
              onChange={(event) => setTopic(event.target.value as CourseTopic | 'All')}
            >
              <option value="All">All topics</option>
              {allTopics.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Level
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as CourseLevel | 'All')}
            >
              <option value="All">All levels</option>
              {allLevels.map((item) => (
                <option key={item} value={item}>
                  {item[0]?.toUpperCase()}
                  {item.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="course-grid">
        {filteredCourses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
        {filteredCourses.length === 0 ? (
          <article className="empty-state course-empty-state">
            <h3>No courses match your filters</h3>
            <p>Try clearing one filter to keep your momentum.</p>
          </article>
        ) : null}
      </div>
    </section>
  )
}
