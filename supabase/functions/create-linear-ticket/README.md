# create-linear-ticket

Supabase Edge Function for creating Linear issues from the global feedback bar.

## Required secrets

Set these via Supabase secrets (not in frontend env files):

- `LINEAR_API_KEY`: Linear personal or service account API key.
- `LINEAR_TEAM_ID`: Team ID where issues should be created.
- `LINEAR_PROJECT_ID` (optional): Default project for issue routing.

## Deploy

```bash
supabase functions deploy create-linear-ticket
```

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
