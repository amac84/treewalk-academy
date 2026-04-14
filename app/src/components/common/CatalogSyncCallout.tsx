import { useAppStore } from '../../hooks/useAppStore'

type CatalogSyncCalloutProps = {
  variant: 'admin' | 'learner'
}

export function CatalogSyncCallout({ variant }: CatalogSyncCalloutProps) {
  const { coursesSyncStatus, coursesSyncMessage, courses, currentUserRole, currentUserId } = useAppStore()

  if (coursesSyncStatus === 'loading') {
    return (
      <article className="catalog-sync-callout catalog-sync-callout--loading" role="status">
        <h2 className="catalog-sync-callout__title">Loading course catalog…</h2>
        <p className="section-copy">
          Fetching <code>academy_courses</code> from Supabase. Until this finishes, workflow counts and the marketplace
          can stay empty.
        </p>
      </article>
    )
  }

  if (coursesSyncStatus === 'local_only') {
    return (
      <article className="catalog-sync-callout catalog-sync-callout--blocked" role="alert">
        <h2 className="catalog-sync-callout__title">Online catalog is not connected</h2>
        <p className="section-copy">
          This build has no Supabase project URL and anon key available in the browser, so the app cannot read{' '}
          <code>academy_courses</code>. Signing in (even as super admin) does not fix that — the shared catalog never
          loads.
        </p>
        <ul className="section-copy catalog-sync-callout__list">
          <li>
            <strong>Cloudflare Pages:</strong> set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
            under Environment variables for the build, then trigger a new deployment so Vite can inline them.
          </li>
          <li>
            <strong>Or</strong> ship <code>supabaseUrl</code> and <code>supabaseAnonKey</code> in{' '}
            <code>public/app-settings.json</code> for that environment.
          </li>
          <li>
            <strong>Local dev:</strong> use <code>app/.env</code> (see <code>app/.env.example</code>) or{' '}
            <code>app/public/app-settings.json</code>, then restart the dev server.
          </li>
        </ul>
      </article>
    )
  }

  if (coursesSyncStatus === 'error') {
    return (
      <article className="catalog-sync-callout catalog-sync-callout--blocked" role="alert">
        <h2 className="catalog-sync-callout__title">Could not load the shared catalog</h2>
        <p className="section-copy">{coursesSyncMessage ?? 'The request to Supabase failed.'}</p>
      </article>
    )
  }

  if (coursesSyncStatus === 'synced' && courses.length === 0) {
    return (
      <article className="catalog-sync-callout catalog-sync-callout--muted" role="status">
        <h2 className="catalog-sync-callout__title">Supabase is connected, but the catalog is empty</h2>
        <p className="section-copy">
          There are no course rows in <code>academy_courses</code> for this project (or they are not visible to the anon
          key). Add courses from admin or check the Supabase table.
        </p>
      </article>
    )
  }

  if (
    variant === 'admin' &&
    coursesSyncStatus === 'synced' &&
    currentUserRole === 'instructor' &&
    courses.length > 0 &&
    !courses.some((c) => c.instructorId === currentUserId)
  ) {
    return (
      <article className="catalog-sync-callout catalog-sync-callout--muted" role="status">
        <h2 className="catalog-sync-callout__title">No courses assigned to you</h2>
        <p className="section-copy">
          Instructors only see workflow counts for courses where <code>instructorId</code> matches your account. Ask a
          content admin to assign you, or use a <code>content_admin</code> / <code>super_admin</code> account to see the
          full catalog.
        </p>
      </article>
    )
  }

  return null
}
