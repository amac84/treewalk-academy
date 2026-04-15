# Live Stream Operations (Mux + OBS)

This runbook is for self-serve professional-development live sessions in Academy.

## Presenter Workflow

1. Open **Admin → Live Events** and copy the live occurrence stream key.
2. In OBS, configure:
   - Service: `Custom`
   - Server: `rtmp://global-live.mux.com:5222/app`
   - Stream key: from the live occurrence card
3. Start stream in OBS 5-10 minutes before scheduled start.
4. Open the learner live-room URL (`/webinars/:occurrenceId/live`) and confirm playback.

## Persistent Rehearsal Slot

- Use **Admin → Live Events → Provision rehearsal stream**.
- Share the same rehearsal stream details with every presenter.
- Rehearsal is internal-only and never learner-facing.
- Presenters should verify:
  - camera framing
  - microphone levels
  - slide share crop/readability
  - network stability for at least 2-3 minutes

## Conversion Flow (Live -> Draft Course)

1. After the stream ends, click **Refresh status** on the occurrence.
2. When Mux publishes `video.asset.ready`, the webhook auto-creates a draft course with the replay attached.
3. Confirm **Conversion = draft created** and open the resulting draft course.
4. Continue normal draft prep (transcript/quiz/metadata) before publishing.

## Fallback / Incident Steps

### Stream does not appear in Academy

1. Confirm OBS is still live.
2. Re-check server URL and stream key.
3. Click **Refresh status** in admin.
4. If still unavailable, stop/start OBS and retry.

### Recording does not auto-convert

1. Click **Refresh status**.
2. If conversion remains blocked, verify:
   - `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` are set
   - Supabase service role secret is available to `mux` function
   - `MUX_WEBHOOK_SIGNING_SECRET` matches the secret configured in Mux webhooks
   - `MUX_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` (optional) is not set too low
   - function logs in Supabase Edge Functions -> `mux`

### Presenter cannot go live

1. Validate in rehearsal stream first.
2. Switch to a backup presenter or backup machine if needed.
3. Keep learners informed via a status note in the live room.

## Pilot Rollout Checklist

- [ ] Internal-only dry run with one presenter
- [ ] Validate rehearsal flow with a second presenter
- [ ] Validate conversion to draft course and replay playback
- [ ] Validate quiz + full-watch completion path on converted replay
- [ ] Run one limited audience event (<100 viewers)
- [ ] Review logs and update runbook before public sessions
