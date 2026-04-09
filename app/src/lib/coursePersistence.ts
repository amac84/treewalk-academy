import type { Course } from '../types'
import { getSupabaseBrowserClient } from './supabaseClient'

const TABLE = 'academy_courses'

type Row = { id: string; data: Course }

export async function persistCourseToSupabase(course: Course): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return { ok: false, message: 'Supabase is not configured in the browser.' }
  }

  const { error } = await sb.from(TABLE).upsert(
    {
      id: course.id,
      data: course,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    console.error('[academy_courses] upsert failed', error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

/**
 * Loads courses from Supabase and merges onto seed courses by id (remote wins).
 * If the table is empty, seeds all courses from app mock data once (`mockData.ts`)
 * so HoL&D sees a warm demo.
 */
export async function loadCoursesFromSupabase(seedCourses: Course[]): Promise<Course[]> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return seedCourses
  }

  const { data: rows, error } = await sb.from(TABLE).select('id, data')
  if (error) {
    console.error('[academy_courses] select failed', error)
    throw new Error(error.message)
  }

  const list = (rows ?? []) as Row[]
  if (list.length === 0) {
    await Promise.all(seedCourses.map((c) => persistCourseToSupabase(c)))
    return seedCourses
  }

  const byId = new Map(list.map((r) => [r.id, r.data]))
  const merged = seedCourses.map((c) => byId.get(c.id) ?? c)
  const seedIds = new Set(seedCourses.map((c) => c.id))
  const remoteOnly = list.map((r) => r.data).filter((c) => !seedIds.has(c.id))
  return [...merged, ...remoteOnly]
}
