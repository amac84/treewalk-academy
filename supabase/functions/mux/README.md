# `mux` Edge Function

Proxies [Mux Video](https://docs.mux.com/) direct uploads and status reads so `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` never ship to the browser. It also hosts OpenAI-backed helpers (transcription and cheap transcript-to-metadata drafting) behind the same Supabase JWT gate.

## Secrets (Supabase Dashboard → Edge Functions → Secrets, or CLI)

| Name | Source |
|------|--------|
| `MUX_TOKEN_ID` | Mux → Settings → Access Tokens |
| `MUX_TOKEN_SECRET` | Shown once when the token is created |
| `OPENAI_API_KEY` | OpenAI platform API key |
| `OPENAI_TRANSCRIBE_FALLBACK_MODEL` | Optional fallback for long-audio token/context errors (default `whisper-1`) |
| `OPENAI_COURSE_METADATA_MODEL` | Optional metadata model override (default `gpt-4o-mini`) |
| `OPENAI_COURSE_QUIZ_MODEL` | Optional quiz model override (default `gpt-4o`) |

**`delete_mux_asset` (draft delete / free Mux quota):** also set `CLERK_SECRET_KEY` (same as Clerk Dashboard API keys) so the function can verify `X-Clerk-Session-Token`. Use `SUPABASE_SERVICE_ROLE_KEY` (auto on hosted Supabase) so **instructors** can be checked against `academy_courses`. Set **`ACADEMY_SUPER_ADMIN_EMAILS`** to a comma-separated list of lowercase emails if you grant super admin in the SPA via `superAdminEmails` in `app-settings.json` only — the Edge Function does not read that file; without this secret those users look like `learner` here.

Optional for local mock UI only (never enable in production):

| Name | Purpose |
|------|---------|
| `MUX_ALLOW_UNAUTHENTICATED` | Set to `true` to skip Supabase JWT checks while the app has no Auth wiring |

**Recommended (local + live DB):** keep this `false` and enable **Anonymous** under Supabase → Authentication → Providers. The Vite app calls `signInAnonymously()` in dev (and when `supabaseMuxAnonFallback=true` in `app/public/app-settings.json`) so demo-role users still send a valid user JWT to this function.

## Deploy

```bash
supabase functions deploy mux
supabase secrets set MUX_TOKEN_ID="..." MUX_TOKEN_SECRET="..." OPENAI_API_KEY="..."
```

## Local serve

From the repo root, pass env vars Mux/OpenAI need (e.g. an env file that includes `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, and `OPENAI_API_KEY`; add `MUX_ALLOW_UNAUTHENTICATED=true` if you are not sending a user JWT):

```bash
supabase functions serve mux --env-file app/.env
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically when the function runs on Supabase; for strict JWT checks locally, ensure those match your project.

## Actions

- **`create_direct_upload`** — optional `cors_origin` (defaults to request `Origin`). Returns `uploadId`, `uploadUrl`.
- **`get_upload`** — requires `upload_id`. Returns `status`, `assetId` when linked.
- **`get_asset`** — requires `asset_id`. Returns `status`, `playbackId` when ready.
- **`transcribe_file`** — `multipart/form-data` with `action=transcribe_file` and `file=<video/audio file>`. Optional `model` and `language`. Returns `text`.
- **`draft_course_metadata`** — JSON body: `action`, `transcript` (string, required), optional `course_title`, optional `allowed_topics` array, optional `course_minutes`. Returns `title`, `summary`, `description`, `category`, `topic`, `model`.
- **`generate_quiz_bank`** — JSON body: `action`, `transcript` (string, required), `question_bank_size` (>0), optional `questions_shown`, optional `course_title`, optional `course_minutes`. Returns `questions`, `questionBankSize`, `questionsShown`, `model`.
- **`summarize_transcript`** — compatibility wrapper that runs metadata + quiz generation in one request and returns the legacy combined payload shape.

These drafting actions do **not** require Mux tokens (only `OPENAI_API_KEY` and auth).

Model selection guidance:

- Send `model` from the client request (for example `openAiTranscribeModel` in `app/public/app-settings.json`).
- If no model is supplied, the function defaults to `gpt-4o-mini-transcribe`.
- If OpenAI returns a context/token-too-large error for the selected model, the function retries once with `OPENAI_TRANSCRIBE_FALLBACK_MODEL` (defaults to `whisper-1`).
- Metadata drafting uses `OPENAI_COURSE_METADATA_MODEL` if set (otherwise `gpt-4o-mini`).
- Quiz generation uses `OPENAI_COURSE_QUIZ_MODEL` if set (otherwise `gpt-4o`).

The Vite app should set `muxFunctionUrl` in `app/public/app-settings.json` to `https://<project-ref>.supabase.co/functions/v1/mux`.
