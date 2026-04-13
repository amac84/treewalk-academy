import type { AppState, Course } from '../types'
import { getSupabaseBrowserClient } from './supabaseClient'

const TABLE = 'academy_courses'
const RUNTIME_STATE_ROW_ID = '__academy_runtime_state__'

type Row = { id: string; data: Course }
type RuntimeRow = { id: string; data: PersistedRuntimeState }

export type PersistedRuntimeState = Pick<
  AppState,
  | 'enrollments'
  | 'progress'
  | 'completions'
  | 'certificates'
  | 'cpdLedger'
  | 'transcript'
  | 'learningActivityLog'
>

export async function persistCourseToSupabase(course: Course): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return { ok: false, message: 'The online catalog is not connected in this browser.' }
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

export async function deleteCourseFromSupabase(
  courseId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return { ok: false, message: 'The online catalog is not connected in this browser.' }
  }

  const { error } = await sb.from(TABLE).delete().eq('id', courseId)

  if (error) {
    console.error('[academy_courses] delete failed', error)
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
  const courseRows = list.filter((r) => r.id !== RUNTIME_STATE_ROW_ID)
  if (courseRows.length === 0) {
    await Promise.all(seedCourses.map((c) => persistCourseToSupabase(c)))
    return seedCourses
  }

  const byId = new Map(courseRows.map((r) => [r.id, r.data]))
  const merged = seedCourses.map((c) => byId.get(c.id) ?? c)
  const seedIds = new Set(seedCourses.map((c) => c.id))
  const remoteOnly = courseRows.map((r) => r.data).filter((c) => !seedIds.has(c.id))
  return [...merged, ...remoteOnly]
}

export async function persistLearnerRuntimeState(
  runtimeState: PersistedRuntimeState,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return { ok: false, message: 'The online catalog is not connected in this browser.' }
  }

  const { error } = await sb.from(TABLE).upsert(
    {
      id: RUNTIME_STATE_ROW_ID,
      data: runtimeState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    console.error('[academy_courses] runtime upsert failed', error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

export async function loadLearnerRuntimeStateFromSupabase(): Promise<
  PersistedRuntimeState | null
> {
  const sb = getSupabaseBrowserClient()
  if (!sb) return null

  const { data, error } = await sb.from(TABLE).select('id, data').eq('id', RUNTIME_STATE_ROW_ID).maybeSingle()
  if (error) {
    console.error('[academy_courses] runtime select failed', error)
    throw new Error(error.message)
  }
  const row = data as RuntimeRow | null
  if (!row?.data || typeof row.data !== 'object') return null
  return row.data
}
