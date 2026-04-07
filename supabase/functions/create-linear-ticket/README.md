# create-linear-ticket

Supabase Edge Function for creating Linear issues from the global feedback bar.

## Required secrets

Set these via Supabase secrets (not in frontend env files):

- `LINEAR_API_KEY`: Linear personal or service account API key.
- `LINEAR_TEAM_ID`: Team ID where issues should be created.
- `LINEAR_PROJECT_ID` (optional): Default project for issue routing.

## Deploy

You need the [Supabase CLI](https://supabase.com/docs/guides/cli). If `supabase` is not installed globally (common on Windows), use **`npx`** from the **repository root** (folder that contains `supabase/`):

1. One-time login: `npx supabase@latest login` (opens the browser).
2. One-time link this repo to your hosted project:  
   `npx supabase@latest link --project-ref <your-project-ref>`  
   (`<your-project-ref>` is the subdomain in `https://<ref>.supabase.co`.)
3. Deploy with **anonymous browser access** (no user JWT on the function):  
   `npx supabase@latest functions deploy create-linear-ticket --no-verify-jwt`

Or from repo root:

```bash
npm run deploy:function:feedback
```

If you omit `--no-verify-jwt`, browser `fetch` without a logged-in Supabase session will get **401** from the gateway.

## Local test example

```bash
curl -i -X POST "http://127.0.0.1:54321/functions/v1/create-linear-ticket" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Quiz page crashes on submit\",\"route\":\"/courses/intro/quiz\"}"
```

### With screenshot (multipart)

```bash
curl -i -X POST "http://127.0.0.1:54321/functions/v1/create-linear-ticket" \
  -F "message=Button overlaps on mobile" \
  -F "route=/courses/intro" \
  -F "image=@./screenshot.png;type=image/png"
```

Images are uploaded to Linear storage via `fileUpload`, then embedded in the issue description. Max size **5MB**; types **PNG, JPEG, WebP, GIF**.

## Safety / security (server-side)

The function applies extra checks beyond MIME type:

- **Text:** strips control characters; blocks `javascript:`, `data:`, and `vbscript:` inside markdown-style links; blocks a small set of high-risk HTML tag names (`script`, `iframe`, etc.).
- **Route:** only allows a path-shaped string (safe for markdown); invalid values become `unknown-route`.
- **Images:** verifies **magic bytes** match declared type so non-images cannot be uploaded as PNG/JPEG/etc.

Linear still renders markdown on its side; these rules reduce junk, misleading links, and malformed uploads. For abuse at scale, add **rate limiting** (e.g. per IP) or **auth** in front of the function separately.
