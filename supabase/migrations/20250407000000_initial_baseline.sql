-- Baseline migration for Treewalk Academy (remote Supabase Postgres).
-- The app currently uses Edge Functions (e.g. Linear feedback) without app tables;
-- add tables in new migrations as features need them.

create extension if not exists "uuid-ossp" with schema extensions;
