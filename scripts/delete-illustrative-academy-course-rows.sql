-- One-off: remove canonical demo course rows copied from older mockData.
-- Safe for real courses: user-created ids use prefix `crs-` from AppStore, not these ids.
-- Run in Supabase → SQL Editor (or psql) against your project.
-- Does not touch __academy_runtime_state__.

delete from public.academy_courses
where id in (
  'course-ethics-2026',
  'course-tax-updates',
  'course-ai-controls',
  'course-advisory-narratives'
);
