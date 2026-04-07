# Treewalk Academy

Invite-oriented LMS frontend for CPD-style learning: course playback, admin tooling, and integrations (Supabase, Mux, Microsoft Teams, Linear feedback).

## Development

```bash
cd app
cp .env.example .env
# Fill in local values; never commit .env
npm install
npm run dev
```

## Environment variables

- **Committed template:** [`app/.env.example`](app/.env.example) lists every variable with placeholders.
- **Client-safe (Vite `VITE_*`):** Supabase URL + anon key, Mux environment IDs, public function URLs. The Supabase anon key is designed to ship in the browser; access is enforced with Row Level Security.
- **Private:** Database password, Mux API tokens, signing keys, Linear API key, Cloudflare deploy tokens, and any service role keys belong only in local `.env` (untracked), CI secrets, or Supabase Edge Function secrets — not in the repo.

## Repo layout

| Path | Purpose |
|------|---------|
| `app/` | Vite + React SPA |
| `supabase/` | Migrations and Edge Functions |
| `treewalk_academy_design.md` | Product and design context |
| `IMPLEMENTATION_REPORT.md` | Build notes and checklist |
| `DESIGN.md` | Pointer to design docs |

## Deploy

Cloudflare Pages settings are described in [`wrangler.toml`](wrangler.toml) (no secrets in file). Set production variables in the hosting dashboard or CI, not in git.
