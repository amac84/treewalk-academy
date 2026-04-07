-- Demo / pilot persistence: full course documents (including Mux fields on segments).
-- RLS is open to anon for shared L&D preview without Supabase Auth wiring yet.
-- Tighten policies before real production (auth + role-based access).

create table if not exists public.academy_courses (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists academy_courses_updated_at_idx on public.academy_courses (updated_at desc);

alter table public.academy_courses enable row level security;

create policy "academy_courses_select_demo"
  on public.academy_courses for select
  to anon, authenticated
  using (true);

create policy "academy_courses_insert_demo"
  on public.academy_courses for insert
  to anon, authenticated
  with check (true);

create policy "academy_courses_update_demo"
  on public.academy_courses for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "academy_courses_delete_demo"
  on public.academy_courses for delete
  to anon, authenticated
  using (true);

comment on table public.academy_courses is 'Treewalk Academy course JSON documents; demo RLS — replace before production.';
