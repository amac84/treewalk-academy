-- Live session chat persistence + realtime feed.
-- Mirrors current demo posture: anon/authenticated RLS is open for preview environments.
-- Tighten policies before production rollout (auth identity + role checks).

create table if not exists public.live_chat_messages (
  id text primary key,
  occurrence_id text not null,
  user_id text not null,
  user_name_snapshot text not null,
  body text not null,
  message_kind text not null check (message_kind in ('question', 'chat')),
  classification_source text not null check (classification_source in ('auto', 'user_override')),
  question_score numeric(4,3) not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_chat_messages_body_not_blank check (char_length(btrim(body)) > 0),
  constraint live_chat_messages_body_max_len check (char_length(body) <= 500)
);

create index if not exists live_chat_messages_occurrence_created_idx
  on public.live_chat_messages (occurrence_id, created_at asc);

create index if not exists live_chat_messages_occurrence_kind_created_idx
  on public.live_chat_messages (occurrence_id, message_kind, created_at asc);

create index if not exists live_chat_messages_occurrence_visible_created_idx
  on public.live_chat_messages (occurrence_id, created_at asc)
  where is_deleted = false;

create or replace function public.set_live_chat_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_live_chat_messages_updated_at on public.live_chat_messages;
create trigger trg_live_chat_messages_updated_at
before update on public.live_chat_messages
for each row
execute function public.set_live_chat_messages_updated_at();

alter table public.live_chat_messages enable row level security;

create policy "live_chat_messages_select_demo"
  on public.live_chat_messages for select
  to anon, authenticated
  using (true);

create policy "live_chat_messages_insert_demo"
  on public.live_chat_messages for insert
  to anon, authenticated
  with check (true);

create policy "live_chat_messages_update_demo"
  on public.live_chat_messages for update
  to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.live_chat_messages;
exception
  when duplicate_object then null;
end
$$;

comment on table public.live_chat_messages is
  'Live webinar chat messages; includes deterministic question classification metadata.';
