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
