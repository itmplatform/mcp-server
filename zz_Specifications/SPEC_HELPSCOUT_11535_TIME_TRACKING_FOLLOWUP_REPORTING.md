# Help Scout 11535 — MCP time tracking, follow-up, reporting, and Clockify migration

**Source:** [Help Scout conversation 3382659721 / 11535](https://secure.helpscout.net/conversation/3382659721/11535/)  
**Requester:** Gilsandro Cezar, UCloud Global PMO  
**Date:** 2026-07-11  
**Status:** Product and technical recommendation  
**Explicitly out of scope:** the reported `query_datamart` 401 error

## Executive recommendation

UCloud has identified real gaps, but the safest answer is not to expose the legacy modules wholesale through MCP.

1. **Clockify history:** offer a controlled one-time migration using a dry-run CSV importer or an assisted internal import. Do not use MCP calls as the bulk-import mechanism.
2. **Ongoing time entries:** add narrow `list_time_entries` and `log_time_entry` MCP tools, backed by a new v2 time-entry API. In normal operation, a caller may write time only for their own licensed user identity.
3. **Follow-up / progress:** add typed MCP tools around the progress-report domain. Much of the v2 write logic already exists, but exact read coverage and project/service parity need completing.
4. **Reports / BI:** expose governed report data and aggregations, starting with time-report detail and summaries. Do not expose the legacy report designer or a generic “run anything” report tool in the first release.
5. **Protect licensing:** never let one administrator or service account continuously submit time on behalf of an arbitrary workforce under one paid seat. One-time historical migration is low risk; ongoing delegated entry is high risk.

This gives the customer a practical answer now, fills the product gaps in reusable increments, and avoids turning integrations into a substitute for Team Member or Full Access licenses.

## What the customer is asking for

The two customer messages contain these requests, excluding the 401 item:

| Request | What they need in practice | Current finding |
|---|---|---|
| Log consumed hours through MCP | Create time entries for project/task/user/date/duration | Not exposed in MCP |
| Create and query “Seguimiento” entries | Read and write task/project progress reports, not merely edit task fields | Not exposed in MCP; partial v2 APIs already exist |
| Access Reports / BI through MCP | Analyze reportable data, including time-report detail | MCP/DataMart covers part of the analytical domain, not the legacy reporting module or detailed daily time rows |
| Native CSV/Excel time-entry import | Load Clockify history in bulk | No native time-entry importer was found |
| Complete REST API outside MCP | Programmatically create/import time entries | A documented v1 REST API already exists at `GET/POST /{company}/timehours` |
| Best official workaround | Safely consolidate Clockify and ITM hours without losing existing data | Use the REST API only through a controlled migration process; do not send raw Clockify rows directly |

## Evidence from the codebase

The investigation searched for `time entry`, `timeentry`, `timesheet`, `TaskTime`, `tblTaskTime`, `followup`, `progress`, `report`, `BI`, `import`, and `license` across ITM.MCP, ITM.Web/API, ITM.Tasks, ITM.Account, and ITM.DataMart.

Relevant existing implementation:

- `ITM.Web/ITM.API/Controllers/TaskTimeController.cs`
  - `GET /{company}/timehours` reads a user-oriented timesheet for a maximum range of about 31 days.
  - `POST /{company}/timehours` writes a list of time rows.
- `ITM.Web/ITM.BusinessAccess/TaskTime.cs`
  - Validates project, task, assignment, dates, hours, and editability.
  - Writes `tblTaskTime`, comments, accepted effort, and update events.
  - Treats the effective key as user + task + date and updates/replaces an existing entry for that key.
- `ITM.Tasks/Controllers/TaskFollowUpController.cs`
  - v2 task progress `POST` and `PATCH` already exist.
- `ITM.Tasks/Controllers/ProjectFollowUpController.cs`
  - v2 project progress-report graph/history read already exists.
- Legacy v1 project/task/activity follow-up controllers provide broader CRUD coverage, but they should not become the long-term MCP dependency.
- `ITM.DataMart/zz_Specifications/time-reports-datamart-research.md`
  - Confirms that DataMart has aggregate task effort fields but not daily time-report rows.
  - Recommends summaries on component documents and exact detail in a separate indexed collection because large projects can exceed MongoDB's 16 MB document limit if rows are embedded.
- Local license/menu configuration confirms an important commercial distinction:
  - Team Member has My Timesheet access.
  - Reporting is a Full Access capability in the current PPM configuration.
  - Project Manager and Team Member do not have the Reporting menu entitlement in that configuration.
- No implementation for CSV/Excel import of time entries was found. Existing import areas concern other entities.

## Current REST workaround: useful, but not a migration contract

The existing public endpoint is:

```http
POST https://api.itmplatform.com/{company}/timehours
Token: {session-token}
Content-Type: application/json

{
  "TimeReports": [
    {
      "EntityId": 55767,
      "WorkItemId": 1193245,
      "Date": "2026-03-24",
      "ReportedHours": "3:00",
      "UserComment": "Imported from Clockify"
    }
  ]
}
```

This is a valid answer to “does a REST endpoint exist?” The answer is **yes**. It is documented and used by ITM's own timesheet UI.

It is not safe to tell UCloud to post its Clockify export directly for the following reasons:

1. **Overwrite/consolidation semantics:** for the same user, task, and date, the code updates or replaces the existing ITM row. Posting only the Clockify duration can destroy the ITM duration instead of adding to it.
2. **Rerun duplicates or changed totals:** there is no external source row ID or import idempotency key in the contract.
3. **Partial success:** rows are processed in a loop and errors are accumulated; the batch is not an atomic migration transaction.
4. **User assignment:** the user must be assigned to the work item for public calls.
5. **Date restrictions:** entries outside task dates are rejected unless the account setting permits them.
6. **Closed/invoiced periods and editing rules:** existing entries may no longer be editable.
7. **Historical user mapping:** Clockify users, projects, and tasks may not map one-to-one to active ITM records.
8. **Delegated-user authorization:** the request model accepts an optional `UserId`. The current business path validates the target user's page access rather than clearly binding the target user to the authenticated caller. This needs a security review and must not be promoted as an admin impersonation feature.

For ordinary self-entry, omit `UserId`; the authenticated token determines the user.

## Recommendation by request

### 1. Consolidate Clockify historical hours

#### Recommendation

Offer UCloud an **assisted, one-time historical import** first. Build it as a reusable import pipeline if another customer requests the same capability; do not build a full UI before validating repeat demand.

The importer may accept CSV or XLSX, but should normalize to a canonical CSV-like row model:

| Field | Required | Mapping rule |
|---|---:|---|
| `sourceEntryId` | Yes | Clockify time-entry ID; used for idempotency |
| `userEmail` | Yes | Map to exactly one ITM user or reject |
| `projectKey` | Yes | Prefer an explicit ITM project ID/code mapping file; do not fuzzy-match silently |
| `taskKey` | Yes | Prefer an explicit ITM task ID/code mapping; unmatched rows require a reviewed fallback task |
| `date` | Yes | Normalize to tenant-local `YYYY-MM-DD` |
| `durationMinutes` | Yes | Positive integer; split cross-midnight entries by local date |
| `description` | No | Store as time-entry comment, subject to length/privacy policy |
| `billable` | No | Map to ITM billing/non-billing fields only when the customer supplies a reviewed mapping |
| `billingCategory` | No | Map explicitly; no name-only silent matching |

#### Import workflow

1. Export Clockify with stable entry IDs and user emails.
2. Upload into a staging/import batch; do not write production rows yet.
3. Validate account, users, project/task relationships, assignments, dates, duration, billing categories, invoiced periods, duplicates, and existing ITM entries.
4. Produce a dry-run report with counts and totals:
   - accepted rows;
   - already imported rows;
   - unmapped users/projects/tasks;
   - date or permission failures;
   - collisions with existing ITM hours;
   - totals by user and project before, Clockify delta, and after.
5. Require an explicit approval of the mapping and totals.
6. Consolidate Clockify rows by user + task + date.
7. Atomically calculate `new total = existing ITM total + not-previously-imported Clockify minutes`.
8. Write in bounded batches with a durable import ledger keyed by source system + source workspace + `sourceEntryId`.
9. Re-read totals and reconcile against the approved dry run.
10. Retain an audit report and a rollback plan for the import batch.

#### Important policy choices

- Historical former employees should be importable as inactive/non-login contributors without forcing a current paid interactive seat, if commercial policy permits it.
- Ongoing entries for active workers must require the worker to hold the appropriate current license.
- If Clockify has no task mapping, the customer may approve one dedicated “Clockify historical hours” task per ITM project. This preserves project totals but intentionally loses task-level fidelity and must not be the silent default.

#### Why not MCP for the migration

MCP is useful for interactive decisions and small writes, not as an ETL engine. Thousands of model-driven calls are slower, harder to reconcile, more expensive, and more likely to be retried ambiguously than a deterministic importer.

### 2. Ongoing time entries through MCP

#### Recommended tool surface

Phase 1 should be deliberately narrow:

```text
list_my_time_entries(startDate, endDate, projectId?, taskId?)
log_time_entry(projectId, taskId, date, durationMinutes, comment?, billingCategoryId?, nonBillableMinutes?, idempotencyKey)
```

Rules:

- The user is always the authenticated caller; there is no `userId` parameter.
- The caller must have `mcp:write`, a time-entry-capable license, access to My Timesheet, and assignment to the task/activity.
- `durationMinutes` is numeric; MCP should not make the model format `H:MM`.
- The API returns the before value, applied delta, after value, time-entry identifier, and idempotency result.
- The first release supports additive logging with an idempotency key. It does not expose destructive replacement or deletion through MCP.
- The server re-reads the source-of-truth time row after writing.
- Every call is audit logged with caller, AI client, project/task, date, delta, and idempotency key.

Example response:

```json
{
  "timeEntryId": 12345,
  "userId": 789,
  "projectId": 100,
  "taskId": 200,
  "date": "2026-07-10",
  "beforeMinutes": 60,
  "appliedMinutes": 90,
  "afterMinutes": 150,
  "idempotentReplay": false
}
```

#### Required platform work

Do not make the MCP REST client call the legacy v1 controller directly as the final architecture. Add a v2 API, for example:

```http
GET  /v2/{account}/time-entries/search
POST /v2/{account}/time-entries
```

The v2 endpoint should centralize authentication, page/menu rights, target-user rules, PM scope, assignment, date policies, billing fields, idempotency, transactions, and audit. It can reuse the existing `tblTaskTime` business rules initially, but must not reuse the unsafe caller-selectable `UserId` behavior.

For an immediate customer workaround before the v2/MCP feature exists, support can provide the documented v1 `POST /{company}/timehours` instructions for **self-entry only**, or run the controlled historical import on UCloud's behalf.

### 3. Seguimiento / progress through MCP

“Seguimiento” is a separate domain from time entry. `update_task.PercentComplete` is intentionally rejected today because progress is stored through follow-up/progress APIs and has side effects such as task status transitions, parent rollups, automatic project progress, events, and notifications.

#### Recommended tools

```text
list_task_progress(projectId, taskId, limit?, skip?)
create_task_progress(projectId, taskId, reportDate, percentage, assessmentId, shortDescription, description?)
update_task_progress(projectId, taskId, progressId, ...changed fields)
get_project_progress(projectId)
```

Optional later parity:

```text
create_project_progress(...)
list_activity_progress(serviceId, activityId, ...)
create_activity_progress(...)
```

#### Implementation take

- Reuse the existing v2 task progress `POST` and `PATCH` routes.
- Add a paginated v2 task-progress `GET`; do not fall back permanently to the v1 controller.
- Reuse the existing v2 project progress-report graph/history read.
- Add explicit v2 project-progress creation only after its payload and side effects are aligned with the current UI path.
- Add service/activity parity as a separate increment because the routes and permission model differ.
- Discover valid assessment values through a typed reference-data endpoint/tool; `assessmentId` is mandatory for a main task follow-up in current validation.
- Confirm writes by reading the created progress record, as other MCP write tools do.

This is a relatively high-value, moderate-effort MCP addition because most domain logic already exists and `update_task` already points users toward it.

### 4. Reports / BI through MCP

#### Product interpretation

“Access to the Reports/BI module” is too broad to implement literally. An AI client does not need the legacy report designer UI; it needs permission-aware data, aggregations, and exportable results.

The first useful gap is detailed time reporting. DataMart currently exposes aggregate fields such as estimated, accepted, and actual time-entry effort on tasks/activities, but not daily rows by user, date, task, cost, or comment.

#### Recommended first capabilities

```text
query_time_entries(startDate, endDate, projectIds?, taskIds?, userIds?, includeComments?, limit?, skip?)
aggregate_time_entries(startDate, endDate, groupBy, projectIds?, userIds?, includeCosts?)
```

Supported `groupBy` values should be explicit, for example `project`, `task`, `user`, `date`, `week`, `month`, and selected combinations. Do not accept arbitrary SQL or arbitrary report definitions.

#### Data architecture

Follow the existing DataMart research recommendation:

- Keep compact time-report summaries on task/activity documents.
- Store exact daily rows in a separate indexed time-report collection.
- Add a v2 paginated `TimeReports/Search` source API with component/task/user/date filters and numeric minute fields.
- Use event-driven refresh plus a scheduled reconciliation window.
- Do not embed full history under component documents; some current documents already exceed 2 MB and MongoDB caps a document at 16 MB.

Costs and comments require field-level authorization:

- `includeCosts` must be allowed only when the caller has the corresponding native financial/report right.
- Comments may contain personal or sensitive text and should default to excluded.
- PM callers must remain restricted to managed projects.
- Report access must check the native menu/right entitlement, not only the coarse MCP/DataMart license type.

#### What not to ship initially

- No generic `run_report(reportId, parameters)` until saved-report ownership, parameter validation, output size, cost visibility, and row-level permissions are proven.
- No MCP tools for creating/editing legacy report definitions.
- No unrestricted SQL, stored-procedure, or report-generator access.

This preserves the value of the native reporting product while providing the analytical building blocks agents actually need.

## License cannibalization risk

### Risk by capability

| Capability | Risk of fewer licenses | Reason | Recommended control |
|---|---|---|---|
| One-time Clockify historical import | Low | It removes migration friction and does not replace daily product use | Treat as onboarding/professional service; mark the batch historical |
| Self-only MCP time entry | Low | Each contributor still needs an eligible user/license | Bind target user to authenticated caller and verify entitlement on every write |
| Team Member narrow MCP time tool | Low to medium | It changes the interface, but still consumes the same Team Member seat | Allow only with a current Team Member-or-higher license; expose only timesheet tools |
| Admin/service account enters time for all active workers | **High** | One Full/Admin seat could replace many Team Member seats | Do not allow ongoing delegated entry under one identity |
| External Clockify/Calendar connector writes for many users | **High unless licensed per contributor** | ITM becomes a passive data sink and workers no longer need to log in | Require each target worker to have an active eligible seat, or sell an integration/automation entitlement priced by active contributors |
| PM access to managed-project analytics | Medium | It may substitute some Full Access reporting use | Respect native report/menu rights; offer curated PM summaries, not unrestricted BI |
| Team Member access to broad BI | High | Reporting is currently a higher-tier capability | Do not expose broad BI to Team Members without a packaging decision |
| Full-user governed BI through MCP | Low | The same paid user gets a new interface to an existing entitlement | Preserve field/menu rights and audit |

### The main commercial failure mode

The dangerous design is:

```text
one integration credential + arbitrary userId -> write time for every worker
```

That allows a customer to maintain many worker identities while purchasing only one powerful interactive license. The gross seat exposure is approximately:

```text
active contributors written by the integration × Team Member seat price
```

minus any integration fee. The exact value depends on contract/product, but the mechanism is clear even without assuming a current list price.

### Packaging recommendation

Use one of these defensible models:

1. **Seat-preserving default:** API/MCP writes are included, but every active target contributor must have an eligible paid license.
2. **Automation add-on:** delegated integrations are licensed by monthly active contributor or by a committed contributor tier, not by number of service credentials.
3. **Historical migration exception:** a time-limited import permission may write for inactive/non-login historical identities, but cannot be used for current-period entries.

Recommendation: start with model 1 plus the historical exception. Consider model 2 only when multiple customers need ongoing delegated ingestion from Clockify, Calendar, ERP, or similar systems.

### Upside that offsets cannibalization

The integrations can also protect or grow revenue:

- Removing migration friction makes replacing Clockify easier and can improve onboarding/conversion.
- Better MCP progress and analytics make Full and PM licenses more valuable.
- Requiring licensed active contributors can move time tracking into ITM without reducing seat count.
- A separately packaged automation entitlement creates an expansion path for customers who want ITM as the system of record without using the UI daily.

The product decision should therefore be “license the actor or the active represented contributor,” not “avoid integrations.”

## Suggested delivery phases

### Phase 0 — answer and assisted migration

- Confirm to UCloud that the v1 time-entry REST endpoint exists.
- Explain that there is no native time-entry CSV import currently.
- Obtain a sample Clockify export and mapping fields.
- Run a read-only dry-run assessment and quote/approve an assisted import.
- Security-review the optional `TimeSheet.UserId` path before any delegated use.

### Phase 1 — progress tools and safe v2 time API

- Complete v2 task progress read coverage and add MCP progress tools.
- Design and build v2 self-only time-entry read/write endpoints with idempotency.
- Add `list_my_time_entries` and `log_time_entry` MCP tools.
- Enforce native timesheet entitlement and audit every write.

### Phase 2 — reusable import

- Add import batch, row ledger, dry run, reconciliation, and rollback support.
- Support CSV first; XLSX can be converted at the boundary.
- Add a narrowly permissioned admin UI only if repeat demand justifies it.

### Phase 3 — governed time-report analytics

- Add `TimeReports/Search` v2 API.
- Add DataMart summaries plus a separate detail collection.
- Add query and aggregation MCP tools with PM scope and field rights.
- Measure usage before considering saved-report execution or report-designer functions.

## Acceptance criteria

### Historical import

- A rerun with the same Clockify source IDs changes no totals.
- Existing ITM hours are added to, never silently replaced.
- Dry-run totals match committed and read-back totals by user and project.
- Unmapped or invalid rows are rejected with actionable reasons.
- A batch audit identifies every inserted/updated value and source row.
- Current invoiced/locked entries cannot be changed without an explicit authorized override.

### MCP time entry

- The authenticated user cannot specify or impersonate another `userId`.
- A Team Member with the narrow capability can access no broader MCP data/tools than licensed.
- Duplicate retries with the same idempotency key apply the duration once.
- Assignment, date, billing, page-right, and license rules match the native timesheet.
- The response reports the source-of-truth before and after totals.

### MCP progress

- Progress creates/updates preserve existing side effects: status transitions, parent/project rollups, events, and notifications.
- PM scope prevents writes outside managed projects.
- Created/updated progress is read back and returned.
- Assessment references are discoverable and validated.

### Reporting

- PM results contain only managed projects.
- Costs and comments are absent unless explicitly requested and authorized.
- Large result sets are paginated and bounded.
- Time-report detail is not embedded into unbounded component documents.
- Native Reporting entitlements are not bypassed through a coarse MCP license check.

## Required tests if implemented

- Unit tests for time parsing, consolidation, mappings, collision behavior, idempotency, entitlement decisions, and field-level report authorization.
- Integration tests for `tblTaskTime` transaction behavior, rollback, partial failures, locked/invoiced periods, events, and read-back.
- Contract tests comparing new v2 time/progress output with the existing v1/UI behavior.
- MCP unit/E2E tests for tool schemas, scope enforcement, cross-user rejection, PM scoping, audit, and source-of-truth verification.
- Import tests must create isolated test data and remove it afterward.
- Any import or reporting UI requires Playwright verification and a corresponding UI E2E specification.

## Open questions for UCloud

These do not block giving them the REST/API answer, but they are required before importing:

1. Can they provide a Clockify export containing stable entry ID, user email, project, task, local date/start time, duration, description, billable flag, and tags?
2. Do Clockify project/task names or codes contain ITM IDs, or must they approve a mapping file?
3. When a Clockify row collides with existing ITM hours for the same user/task/date, do they confirm that the desired result is the sum?
4. How should unmatched Clockify tasks be handled: reject, map manually, or use an approved project-level historical task?
5. Are former employees still present in ITM, and should their hours remain attributed to their original identities?
6. Are billing categories, non-billable minutes, comments, approvals, and costs required, or only consumed-hour totals?
7. Is this a one-time retirement of Clockify, or do they expect an ongoing Clockify-to-ITM synchronization?
8. For “Seguimiento,” do they need task progress, project progress, service activity progress, or all three?
9. For BI, which outputs are missing beyond time-report detail: saved reports, exports, charts, scheduled delivery, or conversational aggregation?

## Suggested customer response (Spanish)

> Gracias por el detalle. Hemos confirmado que actualmente MCP no expone ni las imputaciones de horas ni las entradas de Seguimiento, y tampoco controla el módulo de Informes como tal.
>
> Sí existe una API REST para consultar y registrar imputaciones (`GET/POST /{empresa}/timehours`). No obstante, para migrar el histórico de Clockify no recomendamos enviar el CSV directamente contra ese endpoint: hay que mapear usuarios/proyectos/tareas, sumar de forma segura las horas que ya existen en ITM, controlar periodos bloqueados y hacer la carga idempotente para que una repetición no duplique ni sobrescriba datos.
>
> Nuestra propuesta para vuestro caso es revisar primero una muestra del export de Clockify y preparar una carga histórica con validación previa y un informe de conciliación por usuario y proyecto. En paralelo, proponemos incorporar a MCP herramientas específicas para registrar/consultar horas y Seguimiento, respetando los permisos y la identidad del usuario conectado. Para BI, la opción más útil es exponer consultas y agregaciones controladas —especialmente el detalle diario de horas— en lugar de reproducir dentro de MCP el diseñador de informes completo.
>
> Para preparar la migración necesitaremos una muestra del archivo de Clockify y confirmar cómo se relacionan sus proyectos/tareas con los identificadores de ITM, además de qué hacer cuando ya existen horas para el mismo usuario, tarea y fecha.

## TODO checklist

- [x] Read the full Help Scout conversation and verify that it has no relevant attachments.
- [x] Exclude the 401 issue from this document.
- [x] Trace current MCP tools and license behavior.
- [x] Trace time entry, follow-up, reports, DataMart, and import prior art.
- [x] Confirm the existing REST time-entry endpoint and its payload.
- [x] Assess overwrite, idempotency, assignment, date, authorization, and migration risks.
- [x] Assess license cannibalization by capability.
- [ ] Product owner: approve self-only MCP time entry and the active-contributor licensing rule.
- [ ] Security owner: review the current v1 `TimeSheet.UserId` authorization path.
- [ ] Support/account owner: request a representative Clockify export and answers to the migration questions.
- [ ] Engineering: produce an implementation specification for Phase 1 after product/security decisions.
- [ ] Commercial owner: decide whether repeated delegated integrations require an automation add-on.
