# `mux` Edge Function

Proxies [Mux Video](https://docs.mux.com/) direct uploads and status reads so `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` never ship to the browser.

## Secrets (Supabase Dashboard → Edge Functions → Secrets, or CLI)

| Name | Source |
|------|--------|
| `MUX_TOKEN_ID` | Mux → Settings → Access Tokens |
| `MUX_TOKEN_SECRET` | Shown once when the token is created |

Optional for local mock UI only (never enable in production):

| Name | Purpose |
|------|---------|
| `MUX_ALLOW_UNAUTHENTICATED` | Set to `true` to skip Supabase JWT checks while the app has no Auth wiring |

## Deploy

```bash
supabase functions deploy mux
supabase secrets set MUX_TOKEN_ID="..." MUX_TOKEN_SECRET="..."
```

## Local serve

From the repo root, pass env vars Mux needs (e.g. an env file that includes `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`; add `MUX_ALLOW_UNAUTHENTICATED=true` if you are not sending a user JWT):

```bash
supabase functions serve mux --env-file app/.env
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically when the function runs on Supabase; for strict JWT checks locally, ensure those match your project.

## Actions (POST JSON)

- **`create_direct_upload`** — optional `cors_origin` (defaults to request `Origin`). Returns `uploadId`, `uploadUrl`.
- **`get_upload`** — requires `upload_id`. Returns `status`, `assetId` when linked.
- **`get_asset`** — requires `asset_id`. Returns `status`, `playbackId` when ready.

The Vite app should set `VITE_MUX_FUNCTION_URL` to `https://<project-ref>.supabase.co/functions/v1/mux`.
