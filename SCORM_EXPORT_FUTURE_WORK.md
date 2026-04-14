# SCORM Export Future Work

This document tracks what remains to make Academy course content truly exportable as SCORM packages in a future release.

## Current Baseline (already in place)

- Canonical authored-course contract in `app/src/types.ts` (`Course`, `packageProfile`, `activityOutline`).
- Backward-compatible normalization in `app/src/lib/coursePersistence.ts`.
- Versioned package serializer seam in `app/src/lib/coursePackage.ts` via `buildCoursePackageExport()`.
- Transcript export helpers and versioning in `app/src/lib/transcript.ts`.
- Contract guardrails in:
  - `.cursor/rules/course-schema-contract.mdc`
  - `.cursor/rules/course-export-pipeline-sync.mdc`

## Remaining Work To Become Exportable

## 1) Freeze the export JSON contract

- Define `CoursePackageExport` as the only input contract for downstream packaging.
- Add a short schema spec section in this file (or a dedicated JSON schema file later).
- Add contract tests for backward compatibility when new optional fields are introduced.

### Acceptance

- Any `CoursePackageExport` shape change requires schema version decision + tests.

## 2) Decide media delivery mode per release

- Choose default for v1:
  - `stream`: package references hosted video (simpler, LMS must allow external media).
  - `packaged_file`: package contains video file(s) (larger files, more robust portability).
- Document constraints for each mode (file size limits, signed URLs, expiry behavior).
- If `packaged_file`, implement asset retrieval pipeline from source media.

### Acceptance

- One explicit media mode selected for v1 with documented operational limits.

## 3) Implement SCORM manifest + package builder

- Create a dedicated packaging module (recommended new location: `app/src/lib/scorm/`).
- Generate `imsmanifest.xml` using `CoursePackageExport` and selected media strategy.
- Include launch asset(s) and transcript/caption artifacts in final zip.
- Add deterministic package naming convention (course id + version + timestamp).

### Acceptance

- Can generate a valid SCORM zip from one published course.

## 4) Add SCORM runtime adapter

- Build a launch page/runtime script that:
  - Initializes SCORM API (`LMSInitialize` or `Initialize`).
  - Writes completion/success/score/time values.
  - Commits and terminates cleanly.
- Map Academy completion rules to SCORM fields:
  - watch completion + quiz threshold -> completion/success states.

### Acceptance

- A learner session in SCORM Cloud records pass/fail and score correctly.

## 5) Map assessment interactions cleanly

- Export question/answer data in a SCORM-compatible interaction format.
- Preserve stable question and option identifiers from authored data.
- Document current supported question type(s) and explicitly defer unsupported types.

### Acceptance

- Question-level interaction data appears consistently for exported quiz attempts.

## 6) Add admin export workflow

- Add an admin entry point to export one course package from the current authored course.
- Return package metadata (schema version, generated time, package mode, manifest id).
- Add basic user-facing error handling for missing video/transcript/quiz prerequisites.

### Acceptance

- Admin can click once and download a package (or receive a clear blocking message).

## 7) Verification matrix and CI checks

- Add automated checks:
  - package JSON contract tests
  - manifest generation tests
  - zip content smoke tests
- Add manual verification matrix:
  - SCORM Cloud
  - at least one target customer LMS player

### Acceptance

- Export build passes automated checks and has a repeatable manual sign-off checklist.

## 8) Governance and release controls

- Require schema/version notes for any change touching:
  - `app/src/types.ts`
  - `app/src/lib/coursePackage.ts`
  - `app/src/lib/transcript.ts`
  - `supabase/functions/mux/index.ts`
- Keep `.cursor/rules/*.mdc` guardrails updated when new export surfaces are introduced.

### Acceptance

- Export-impacting changes cannot merge without versioning and test updates.

## Suggested Incremental Milestones

1. **M1: JSON contract hardened**
   - Contract tests and compatibility checks complete.
2. **M2: SCORM zip MVP**
   - Manifest + launch runtime + zip generated for one course.
3. **M3: Admin export UX**
   - Download flow in admin with useful validations/errors.
4. **M4: LMS validation**
   - SCORM Cloud + one customer LMS verified.

## Definition of Done for "Exportable v1"

- Published course can be converted to a valid SCORM package zip.
- Package launches in SCORM Cloud and reports completion + score correctly.
- Export process is repeatable, versioned, and covered by tests.
- Documentation exists for media mode constraints and supported quiz capabilities.
