import { useMemo, useState } from 'react'
import { CourseCard } from '../../components/common/CourseCard'
import { useAppStore } from '../../hooks/useAppStore'
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
  const { courses } = useAppStore()
  const [topic, setTopic] = useState<CourseTopic | 'All'>('All')
  const [level, setLevel] = useState<CourseLevel | 'All'>('All')
  const [search, setSearch] = useState('')

  const publishedCourses = courses.filter((course) => course.status === 'published')

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
    <section>
      <header className="panel">
        <div className="section-header">
          <h2>Courses Marketplace</h2>
          <p>Card-first discovery with focused filters to keep momentum high.</p>
        </div>
        <div className="filters">
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
      </header>

      <div className="course-grid">
        {filteredCourses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
        {filteredCourses.length === 0 ? (
          <article className="panel empty-state">
            <h3>No courses match your filters</h3>
            <p>Try clearing one filter to keep your momentum.</p>
          </article>
        ) : null}
      </div>
    </section>
  )
}
