import type {
  AppState,
  Course,
  CourseAudience,
  CoursePackageActivity,
  CoursePackageMediaDelivery,
  CoursePackageProfile,
  CoursePackageRuntimeMode,
} from '../types'

const normalizeCourseAudience = (value: unknown): CourseAudience =>
  value === 'internal' ? 'internal' : 'everyone'

const COURSE_PACKAGE_SCHEMA_VERSION = 1
const DEFAULT_EXPORT_LOCALE = 'en-US'

const normalizeCoursePackageRuntimeMode = (value: unknown): CoursePackageRuntimeMode =>
  value === 'multi_sco' ? 'multi_sco' : 'single_sco'

const normalizeCoursePackageMediaDelivery = (value: unknown): CoursePackageMediaDelivery =>
  value === 'packaged_file' ? 'packaged_file' : 'stream'

function normalizeCoursePackageProfile(course: Pick<Course, 'id' | 'packageProfile'>): CoursePackageProfile {
  const raw =
    course.packageProfile && typeof course.packageProfile === 'object' ? course.packageProfile : undefined
  const schemaVersion =
    typeof raw?.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion) && raw.schemaVersion > 0
      ? Math.round(raw.schemaVersion)
      : COURSE_PACKAGE_SCHEMA_VERSION
  const locale = typeof raw?.locale === 'string' && raw.locale.trim() ? raw.locale.trim() : DEFAULT_EXPORT_LOCALE
  const manifestIdentifier =
    typeof raw?.manifestIdentifier === 'string' && raw.manifestIdentifier.trim()
      ? raw.manifestIdentifier.trim()
      : course.id
  return {
    schemaVersion,
    locale,
    runtimeMode: normalizeCoursePackageRuntimeMode(raw?.runtimeMode),
    mediaDelivery: normalizeCoursePackageMediaDelivery(raw?.mediaDelivery),
    manifestIdentifier,
  }
}

function normalizeCpdProviderName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t || undefined
}

function normalizeCourseActivityOutline(raw: unknown): CoursePackageActivity[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const outline = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const typed = entry as Record<string, unknown>
      const id = typeof typed.id === 'string' ? typed.id.trim() : ''
      const title = typeof typed.title === 'string' ? typed.title.trim() : ''
      if (!id || !title) return null
      const type = typed.type === 'resource' ? 'resource' : typed.type === 'video_assessment' ? 'video_assessment' : null
      if (!type) return null
      return {
        id,
        title,
        type,
        required: typeof typed.required === 'boolean' ? typed.required : true,
      } satisfies CoursePackageActivity
    })
    .filter((entry): entry is CoursePackageActivity => Boolean(entry))
  return outline.length > 0 ? outline : undefined
}

/** Ensures newer fields exist when loading JSON documents written before schema changes. */
export function normalizeCourseFromRemote(data: Course): Course {
  return {
    ...data,
    audience: normalizeCourseAudience(data.audience),
    packageProfile: normalizeCoursePackageProfile(data),
    activityOutline: normalizeCourseActivityOutline(data.activityOutline),
    cpdProviderName: normalizeCpdProviderName(data.cpdProviderName),
  }
}
import { describeSupabaseTransportFailure, getSupabaseBrowserClient } from './supabaseClient'

const TABLE = 'academy_courses'
/** Special row reserved for learner runtime evidence; all other rows are authored `Course` documents only. */
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
> & { removedCatalogCourseIds?: string[] }

export async function persistCourseToSupabase(course: Course): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return { ok: false, message: 'The online catalog is not connected in this browser.' }
  }

  try {
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
      return { ok: false, message: describeSupabaseTransportFailure('saving a course', error) }
    }
    return { ok: true }
  } catch (caught) {
    console.error('[academy_courses] upsert threw', caught)
    return { ok: false, message: describeSupabaseTransportFailure('saving a course', caught) }
  }
}

export async function deleteCourseFromSupabase(
  courseId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return { ok: false, message: 'The online catalog is not connected in this browser.' }
  }

  try {
    const { error } = await sb.from(TABLE).delete().eq('id', courseId)

    if (error) {
      console.error('[academy_courses] delete failed', error)
      return { ok: false, message: describeSupabaseTransportFailure('deleting a course', error) }
    }
    return { ok: true }
  } catch (caught) {
    console.error('[academy_courses] delete threw', caught)
    return { ok: false, message: describeSupabaseTransportFailure('deleting a course', caught) }
  }
}

export type LoadCoursesFromSupabaseOptions = {
  /** IDs removed by authors; excluded from results and from empty-table seeding. */
  removedCatalogCourseIds?: string[]
}

function removedCatalogIdSet(ids: string[] | undefined): Set<string> {
  if (!ids?.length) return new Set()
  return new Set(ids.map((id) => id.trim()).filter(Boolean))
}

/**
 * Loads courses from Supabase and merges onto seed courses by id (remote wins).
 * If the table is empty, seeds from `seedCourses` when non-empty (skipping `removedCatalogCourseIds`).
 */
export async function loadCoursesFromSupabase(
  seedCourses: Course[],
  options?: LoadCoursesFromSupabaseOptions,
): Promise<Course[]> {
  const removed = removedCatalogIdSet(options?.removedCatalogCourseIds)

  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return seedCourses.filter((c) => !removed.has(c.id))
  }

  let rows: Row[] | null = null
  try {
    const result = await sb.from(TABLE).select('id, data')
    if (result.error) {
      console.error('[academy_courses] select failed', result.error)
      throw new Error(describeSupabaseTransportFailure('loading the course catalog', result.error))
    }
    rows = result.data as Row[] | null
  } catch (caught) {
    if (caught instanceof Error && caught.message.startsWith('Could not reach Supabase')) {
      throw caught
    }
    console.error('[academy_courses] select threw', caught)
    throw new Error(describeSupabaseTransportFailure('loading the course catalog', caught))
  }

  const list = rows ?? []
  const courseRows = list.filter((r) => r.id !== RUNTIME_STATE_ROW_ID)
  if (courseRows.length === 0) {
    const toSeed = seedCourses.filter((c) => !removed.has(c.id))
    await Promise.all(toSeed.map((c) => persistCourseToSupabase(c)))
    return seedCourses.filter((c) => !removed.has(c.id))
  }

  const byId = new Map(courseRows.map((r) => [r.id, normalizeCourseFromRemote(r.data)]))
  const merged = seedCourses.map((c) => normalizeCourseFromRemote(byId.get(c.id) ?? c))
  const seedIds = new Set(seedCourses.map((c) => c.id))
  const remoteOnly = courseRows
    .map((r) => normalizeCourseFromRemote(r.data))
    .filter((c) => !seedIds.has(c.id))
  const combined = [...merged, ...remoteOnly]
  return combined.filter((c) => !removed.has(c.id))
}

export async function persistLearnerRuntimeState(
  runtimeState: PersistedRuntimeState,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = getSupabaseBrowserClient()
  if (!sb) {
    return { ok: false, message: 'The online catalog is not connected in this browser.' }
  }

  try {
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
      return { ok: false, message: describeSupabaseTransportFailure('saving learner progress', error) }
    }
    return { ok: true }
  } catch (caught) {
    console.error('[academy_courses] runtime upsert threw', caught)
    return { ok: false, message: describeSupabaseTransportFailure('saving learner progress', caught) }
  }
}

export async function loadLearnerRuntimeStateFromSupabase(): Promise<
  PersistedRuntimeState | null
> {
  const sb = getSupabaseBrowserClient()
  if (!sb) return null

  let data: RuntimeRow | null = null
  try {
    const result = await sb.from(TABLE).select('id, data').eq('id', RUNTIME_STATE_ROW_ID).maybeSingle()
    if (result.error) {
      console.error('[academy_courses] runtime select failed', result.error)
      throw new Error(describeSupabaseTransportFailure('loading learner progress', result.error))
    }
    data = result.data as RuntimeRow | null
  } catch (caught) {
    if (caught instanceof Error && caught.message.startsWith('Could not reach Supabase')) {
      throw caught
    }
    console.error('[academy_courses] runtime select threw', caught)
    throw new Error(describeSupabaseTransportFailure('loading learner progress', caught))
  }
  const row = data as RuntimeRow | null
  if (!row?.data || typeof row.data !== 'object') return null
  return row.data
}
