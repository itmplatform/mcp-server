# SPEC: MCP project-level progress (Seguimiento) tools

> **Driver:** [Help Scout 11761](https://secure.helpscout.net/conversation/3408302709/11761/)
> (Gilsandro Cezar, Ucloud PMO, 2026-08-04): expose the project-level Seguimiento tab
> (Proyecto -> Seguimiento) via MCP: evaluation (semaphore), % completed, and status
> description, analogous to the existing task progress tools. Use case: automate the
> weekly/monthly project status report from the assistant.
> **Prior art:** this exact increment was consciously deferred in
> [done/SPEC_MCP_PROGRESS_TOOLS.md](done/SPEC_MCP_PROGRESS_TOOLS.md) ("Project-level progress
> create/update (`create_project_progress`) -- separate increment").
> **Status:** Implemented 2026-08-06 (Option B, together with `log_time_entry` from
> [SPEC_MCP_TIME_ENTRY_TOOLS.md](SPEC_MCP_TIME_ENTRY_TOOLS.md) on the shared v1 request path).
> Local: 523 unit + 113 e2e green, catalog 48.9 KB (< 49 KB budget). Stage verification pending.
> **Corrections found during implementation (E2E-verified):**
> 1. The manual v1 insert DOES auto-close the project at 100%: the logic lives inside the
>    `tblProjectFollowUpInsert` stored procedure (status request "Auto closed by 100%
>    follow-up" + completed status), not in C#. The update sproc has no such logic. Tool
>    description and changelog warn about it (hours must be logged before a 100% report).
> 2. The v1 PUT deserializes `AssessmentId`/`PercentageCompleted` as non-nullable ints, so
>    the server-side load-merge only works for string fields; omitted numeric fields arrive
>    as 0 and fail validation. `update_project_progress` therefore reads the entry first and
>    carries the stored assessment/percentage when not supplied.

---

## 1. What the customer sees and what exists today

The UI tab shows, per project: last follow-up date, evaluation (semaphore: Bueno / No
Critico / Critico = the account's `tblAssesment` records), % completed, and a free-text
status description. Rows live in `tblProjectFollowUp`.

Current MCP surface:

- `get_project_progress` returns only the `ProjectFollowUpGraph` (expected/baseline curves +
  `FollowUps` as date+percentage pairs). No assessment, no description, no entry IDs.
- `create_task_progress` with `AutoProjectFollowUp: true` cascades a **percentage-only**
  automatic project follow-up (short description hardcoded to "Seguimiento automatico",
  assessment NULL). It cannot carry an evaluation or a status narrative.
- No MCP tool creates or updates a manual project follow-up. The customer's gap report is
  accurate.

## 2. Platform contract (verified in code, 2026-08-06)

### v1 (ITM.Web) -- complete, scoped CRUD

[ProjectFollowUpController.cs](../../ITM.Web/ITM.API/Controllers/ProjectFollowUpController.cs):

| Route | Verb | Handler |
|---|---|---|
| `{Account}/project/{ProjectId}/progress` | GET | `ProjectFollowUpByProjectId` -- full rows incl. custom fields |
| `{Account}/project/{ProjectId}/progress` | POST | `InsertProjectFollowUp` |
| `{Account}/project/{ProjectId}/progress/{ProjectProgressId}` | PUT | `UpdateProjectFollowUp` (load-merge-save: omitted fields keep stored values) |
| `{Account}/project/{ProjectId}/progress/{ProjectProgressId}` | DELETE | out of scope for MCP |

Business layer ([ITM.BusinessAccess/ProjectFollowUp.cs](../../ITM.Web/ITM.BusinessAccess/ProjectFollowUp.cs)):

- Auth: `TokenValidationWithPMRights` on `UserPages/ProjectFollowUp.aspx` with
  Insert/Update rights -- PM-license scoping comes free.
- Scoping: insert and update both verify the project belongs to the caller's account, and
  update verifies the follow-up row belongs to the given project (lines 317-327). The
  2026-07 cross-tenant project-progress leak ticket is fixed
  ([done ticket](../../ITM.Web/zz_Tickets/done/2026-07-07-cross-tenant-project-progress-leak.md)).
- Validation (`CheckForValidData`, lines 237-285): `AssessmentId` required and validated
  against the account's `tblAssesment` (same table the task tools use via
  `get_reference_data({entity: 'assessments'})`); `ShortDescription` required;
  `ReportDate` required and parseable; `PercentageCompleted` 0-100.
- Request body keys (v1 `Tiebelize` class): `AssessmentId`, `ShortDescription`,
  `DetailDescription`, `PercentageCompleted`, `ReportDate`, optional `CustomField` list.
- Response: `ProjectFollowUpDetailMessage { ProjectProgressId, StatusCode, StatusMessage }`
  (201 on create). No saved-record echo; readback must be a separate GET.
- Side effects: `updated` Project/Service event via the action handler. **Auto-close at
  100% DOES happen on insert** (corrected 2026-08-06): the `tblProjectFollowUpInsert`
  stored procedure itself applies the account's completed status and records a status
  request ("Auto closed by 100% follow-up") when a 100% entry is inserted and no pending
  status request exists. The update sproc does not auto-close.

### v2 (ITM.Tasks) -- read-only graph, no manual write path

- `ProjectFollowUpController` exposes only `GET/POST v2/.../ProgressReports` (the graph).
- `IProjectFollowUpManager` has `InsertAutomaticProgress` only; the DA `Insert` hardcodes
  `intAssessment = null, ntextAssementDescription = null`
  ([ProjectFollowUpManagerDA.cs:38](../../ITM.Tasks/ITM.Tasks/DA/ProjectFollowUpManagerDA.cs)).
  A v2 manual write would need: new DA insert/update with assessment + description, scoped
  manager overloads (account/project validation), controller POST/PATCH/GET-list routes,
  assessment validation, and API gateway route entries -- the same shape of backend work as
  the 2026-07-13 task-progress GET additions, but larger (writes, not just reads).

### MCP plumbing

`src/clients/rest-client.ts` builds `{apiUrl}/v2/{company}/...` only. Calling v1 routes
needs a small v1 request path (same gateway host, no `/v2` prefix, same `Token` header).
This is the **same plumbing** [SPEC_MCP_TIME_ENTRY_TOOLS.md](SPEC_MCP_TIME_ENTRY_TOOLS.md)
Section 3 already requires for `POST /{account}/timehours` (v1-only, no v2 equivalent).
Building it once serves both features.

## 3. Implementation options

**Option B (recommended): MCP calls the v1 endpoints.**

- Zero backend changes, MCP-only release; can ship together with `log_time_entry` on the
  shared v1 request path.
- The v1 surface is complete, validated, and scoped (Section 2); PM-license scoping is
  enforced server-side via page rights.
- Trade-off: v1 field names differ (`ProjectProgressId`, `PercentageCompleted`,
  `DetailDescription`); the tool normalizes to the same camelCase inputs and output keys the
  task progress tools use, so the deviation stays invisible to agents.
- The task-progress spec's earlier rejection of a v1 fallback was based on the unscoped
  detail lookup (cross-tenant leak pattern) and on v1 being a dead end for that feature.
  Neither applies here: the leak is fixed, the project follow-up handlers validate scoping,
  and if ITM.Tasks later grows v2 CRUD the tool internals swap without a contract change.

**Option A (alternative): build v2 endpoints in ITM.Tasks first.**

- Cleaner long-term (one auth model, normalized columns), matches the "MCP stays on v2"
  preference. Cost: ITM.Tasks + gateway + MCP coordinated release, new scoped manager/DA
  write methods, backend test suite -- for behavior v1 already implements. Choose this only
  if we decide v1 must never be called from MCP even behind a normalizing tool layer.

**Verify on stage before implementation (both options):** the API gateway forwards
`{account}/project/{id}/progress` v1 routes for the MCP session token, and the GET list
returns rows for a project the session user manages but did not create.

## 4. Tool surface (Option B)

Two new write tools + one enrichment. Names follow the deferred-increment naming and the
task progress precedent.

### `create_project_progress` (write, `mcp:write`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | number | yes | |
| `reportDate` | string | yes | ISO 8601 date |
| `percentage` | number | yes | 0-100 |
| `assessmentId` | number | yes | From `get_reference_data({entity: 'assessments'})` |
| `shortDescription` | string | yes | Status headline |
| `description` | string | no | Detailed narrative (maps to v1 `DetailDescription`) |

- `POST {account}/project/{projectId}/progress` with the v1 key mapping.
- Readback: `GET {account}/project/{projectId}/progress`, select the row whose
  `ProjectProgressId` matches the create response; verify percentage, assessment,
  shortDescription; return the normalized record (standard write-confirmation pattern).
- Description states: this is the project-level Seguimiento entry (the project status
  report), independent from per-task progress; and warns that a 100% entry auto-closes the
  project (sproc side effect), so hours must be logged first.

### `update_project_progress` (write, `mcp:write`)

Same optional fields plus required `progressId`; at least one field required. `PUT
{account}/project/{projectId}/progress/{progressId}`. The v1 merge only works for string
fields (numeric fields deserialize as non-nullable ints), so the tool reads the entry
first and carries the stored `AssessmentId`/`PercentageCompleted` when not supplied.
Same readback as create.

### Enrich `get_project_progress` (read)

Add optional `includeEntries: boolean` (default false). When true, also call the v1 GET
list and return `entries`: full follow-up records (id, reportDate, percentage,
assessmentId + name, shortDescription, description, createdBy), newest first. This answers
"what is the latest status report and its evaluation" without a new tool name, keeping the
catalog small. The default response stays unchanged (curves only).

## 5. Constraints and cautions

- **Tool catalog budget:** v1.0.17 sits just under the 49 KB Claude limit (see commit
  `ef30d9d`). Two new tools + one param must be measured against the budget in the same way;
  trim descriptions if needed.
- **Team Member licenses** remain blocked from MCP; PMs are scoped by the server-side page
  rights -- no new authorization logic in MCP.
- **Custom fields on follow-ups** (page type `ProjectFollowUp`, id 63) are readable through
  the v1 list (the enrichment exposes them as returned) but custom-field **writes** are out
  of scope for this increment.
- **Services:** the v1 controller hardcodes `IsServices = false`; service-level follow-up
  tools are out of scope (none requested).
- **Delete:** exists in v1, excluded from MCP by standing decision.
- DataMart is not involved; no eventual-consistency caveat applies to these tools.

## 6. Tests

- Unit (vitest): payload mapping (camelCase -> v1 keys), required-field validation, scope
  gate, readback verification, list normalization, `includeEntries` behavior.
- E2E (local stack): create project -> create progress -> list shows entry with assessment
  -> update percentage -> readback -> negative: invalid assessment 400 surfaces the REST
  message; cleanup deletes the project.
- Stage: scripted OAuth e2e (existing recipe) covering create/update/enriched read plus a
  PM-scoped negative.

## 7. Out of scope

- Service/activity-level follow-up tools.
- Custom-field writes on follow-up entries.
- Delete tools.
- v2 backend CRUD in ITM.Tasks (only if Option A is chosen).
