# Specification: Progress History Reads from DataMart + Data-Source Routing Rule

Date: 2026-08-07
Status: Blocked on the DataMart feature
(`ITM.DataMart/zz_Specifications/done/project-task-progress-history.md`, embedded
architecture decided 2026-08-07). Implement after that feature is deployed and
tenants are regenerated.

## Part 1: Data-source routing rule (normative, applies to all future tools)

This rule already exists implicitly in the codebase; this section makes it
explicit so future tool development follows it.

1. Reads come from DataMart whenever DataMart holds the data. DataMart reads
   are quota-free (no ITM API rate-limit consumption), fast, and can span the
   whole portfolio in one query.
2. REST is used for reads only when one of these applies:
   - DataMart does not hold the data (today: progress history, effort
     breakdown, time entries, risk/issue full detail, users, reference data,
     custom-field definitions).
   - The tool promises authoritative freshness for a single item (pattern:
     `get_task` reads v2 REST as "source of truth, not affected by DataMart
     sync delay", `src/tools/tasks.ts:83,92`).
   - Write readback verification (all write tools confirm saved state via
     REST, never via DataMart).
3. Writes always go to REST. DataMart is a read-only projection.
4. Freshness contract: DataMart lags writes by up to ~60 seconds (writer
   debounce) and is eventually consistent; events are fire-and-forget with
   tenant regeneration as the recovery path. Tool descriptions must state the
   lag on DataMart-backed tools, as `search_tasks` does
   (`src/tools/tasks.ts:100-103`).
5. When DataMart gains a dataset that an existing REST-read tool serves, that
   tool must be migrated to DataMart (with the fallback pattern from Part 2)
   as part of the same feature. Do not leave GET tools burning API quota for
   data DataMart already has.

Verified current routing map (2026-08-07):

| Source | Tools |
|---|---|
| DataMart | `search_projects`, `get_project`, `search_services`, `get_service`, `search_tasks`, `aggregate_portfolio`, `get_project_budget`, all subcomponent pagers (`list_project_tasks`, `get_project_risks/issues/purchases/revenues`, `list_service_activities`) via `fetchSubcomponentPage` (`src/tools/subcomponent-page.ts:53-80`), `query_datamart` |
| REST v2 | `get_task`, `get_risk`, `get_issue`, `get_task_effort`, `list_task_progress`, `get_project_progress` (graph), reference data, custom fields, users, all writes + readbacks |
| REST v1 | `get_project_progress` (entries), time-entry tools (`timehours`), project progress writes |

## Part 2: Changes when DataMart ships progress history

DataMart will add `projectProgressReports[]` on project components and
`progressReports[]` on each task (embedded). Migrate the two read tools:

### `list_task_progress` (src/tools/progress.ts:67-80)

- Replace the v2 REST call with a DataMart aggregation:
  `$match { id: projectId }` then `$unwind $tasks` then
  `$match { "tasks.id": taskId }` then `$project { "tasks.progressReports": 1 }`
  then `$limit`. Sort newest first to preserve the current tool contract.
- Fallback: if the matched task document has NO `progressReports` field
  (field absent, not empty array), fall back to the current v2 REST call.
  Field absence means the tenant has not been regenerated since the DataMart
  feature deployed; an empty array means the task genuinely has no reports.
  This depends on DataMart materializing empty arrays on full rebuild, which
  is a stated dependency on the DataMart spec.
- Keep the output field names agents already know (normalize DataMart
  camelCase to the current shape) so agent-facing behavior is unchanged.

### `get_project_progress` (src/tools/progress.ts:82-102)

- The `includeEntries` branch replaces `fetchNormalizedProgressEntries` (v1
  `project/{id}/progress`, `src/tools/project-progress.ts:65-69`) with a
  DataMart read of `projectProgressReports`, normalized to the same entry
  shape (`ProjectProgressId`, `Percentage`, `AssessmentName`, ...). Same
  absent-vs-empty fallback rule as above.
- The graph part (expected/baseline curves) STAYS on v2 REST
  `projects/{id}/progressreports`: DataMart's `progressReportHistory` is
  Waterfall-only, the REST graph is not.
- Note: DataMart stores the assessment label in the tenant base language;
  the v1 path returned the caller-language label. Accepted trade-off,
  document it in the tool description.

### Unchanged

- `create_task_progress`, `update_task_progress`, `create_project_progress`,
  `update_project_progress`, and all readback verification stay on REST.
  These same REST mutations emit the `progressHistory` event that refreshes
  DataMart, so MCP writes propagate with no extra work.

### query_datamart guardrails

- Add `projectProgressReports` to `HEAVY_ARRAY_FIELDS`
  (`src/validation/query-validator.ts:19-20`) so `projectProgressReports: 1`
  is rejected like `tasks: 1`.
- Update the `query_datamart` description (`src/tools/datamart.ts:47-60`):
  add the new arrays to the key-fields list and the dot-notation guidance
  (`"tasks.progressReports.percentageCompleted": 1`).

### Documentation and tests

- Update README tool table lines for the two migrated tools and the
  data-source routing section.
- Unit tests: pipeline builders, normalizers, absent-vs-empty fallback.
- Integration test against a local DataMart with one backfilled and one
  non-backfilled tenant fixture.

## Acceptance criteria

- `list_task_progress` and `get_project_progress` entries return identical
  agent-facing shapes as today, sourced from DataMart when available.
- Zero ITM API calls for progress reads on backfilled tenants.
- Non-backfilled tenants silently fall back to REST (no errors, no behavior
  change).
- Write tools and readbacks unchanged.
