# Treewalk Academy (Prototype)

This directory contains a production-minded prototype for Treewalk Academy:

- Invite-only CPD-first LMS experience for accountants
- Strict course completion logic (100% watch + quiz >= 80%)
- Quarter-hour CPD calculation
- 3-year transcript view + certificate references
- Learner and admin mode flows

## Stack

- React + TypeScript + Vite
- In-memory app state to simulate Supabase-backed workflows
- Vitest for business-logic unit tests

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
npm run test
```

## Functional Notes

### Completion Logic

A course is marked complete only when both are true:

1. Learner has watched 100% of segments (no-skip progression enforced)
2. Learner has a passing quiz score (>= 80%)

Retakes are unlimited. The most recent passing attempt is treated as the active pass.

### CPD

`cpd_hours = round(video_minutes / 60, nearest 0.25)`

### Roles

- learner
- instructor
- content_admin
- hr_admin
- super_admin

### Admin Workflow

`draft -> review -> published`

Role-based transition rules are enforced in the app store.
