# Ticket: Full Audit of MCP Tool/API Contract Mismatches

Created: 2026-05-14
Severity: High
Area: ITM.MCP, ITM.Tasks, ITM.Account, ITM.Web API gateway, DataMart reads, tests

## Progress Log

### 2026-05-14 Codex session

- Read repo guidance: `README.md`, `CLAUDE.md`, parent `House-rules.md`, `test-and-build.md`, `DEBUGGING.md`, `ENVIRONMENTS-AND-ACCESS.md`, `ITM-API-VERSIONING.md`, and `zz_Tickets/first-interaction-mcp.txt`.
- Traced MCP write tools in `src/tools/write-tools.ts` and source v2 routes/managers in `../ITM.Tasks`.
- Performed disposable live fact-checks through `http://localhost/ITM.API/v2/testsmarter/...` and SQL readbacks against `TROJANHORSE\SQLEXPRESS`; disposable projects/tasks/risks/issues were deleted afterward.
- Confirmed direct `POST /v2/testsmarter/mcp/audit` inserts into `dbo.tblMcpAuditLog`, but ITM.MCP defaults to `createNoOpAuditClient()` unless `ITM_AUDIT_ENABLED=true`, explaining missing rows for ordinary local/API-key sessions.
- Implemented write-tool contract normalization in `src/tools/write-tools.ts`:
  - `update_project` now maps MCP `StatusId` to REST `ProjectStatusId` and rejects conflicting aliases.
  - `create_task`/`update_task` map `Description` to REST `Details` and reject known-ignored `PercentComplete`/`AssignedToUserId`.
  - `create_risk` maps `Impact`/`Probability` aliases to `ImpactId`/`ProbabilityId`, requires `LevelId`, and normalizes risk reference `Id` values to `BaseId` where REST requires base IDs.
  - `create_issue` maps `TypeId`/`StatusId`/`Resolution` to REST `Type`/`Status`/`FinalResolution`, rejects unsupported `Severity`, and normalizes issue reference `Id` values to `BaseId`.
- Changed all write tools to read back the source-of-truth v2 REST entity after POST/PATCH and verify requested fields before returning the stale DataMart notice.
- Exposed `riskimpacts` and `riskprobabilities` through `get_reference_data`; did not expose `risklevels` because the live v2 endpoint does not exist.
- Changed audit configuration so audit is enabled by default and only disabled by `ITM_AUDIT_ENABLED=false`.
- Added/updated unit tests for argument normalization, alias conflicts, unsupported fields, reference `Id` to `BaseId` mapping, write readback verification, reference data coverage, and audit default behavior.
- Added `npm run test:integration` plus integration tests that call local v2 REST and SQL-verify project status, task details, risk fields, and issue fields.
- Expanded MCP E2E write tests to create disposable fixtures, call write tools through MCP, and verify source-of-truth REST/SQL for task details, project status, risk, and issue writes.
- Verification run completed:
  - `npm test` passed: 25 test files / 152 tests.
  - `npm run build` passed.
  - `npm run test:integration` passed: 1 test file / 4 tests.
  - `$env:MCP_E2E_PORT='6161'; npm run test:e2e` passed: 10 test files / 23 tests. A fresh E2E port was used to avoid reusing a stale server on 6160.

## Live Contract Fact-Checks

Tool: `update_project`
Field exposed by MCP: `StatusId`
REST endpoint: `PATCH /v2/testsmarter/projects/{projectId}`
Payload tested: `{ "StatusId": 662751 }`
REST response: `200 Project updated successfully.`
Source readback: SQL `tblProject.intProjectStatuesId` stayed at `662750`.
Conclusion: ignored by v2 PATCH. MCP must map `StatusId` to `ProjectStatusId` or expose `ProjectStatusId`.

Tool: `update_project`
Field expected by REST: `ProjectStatusId`
REST endpoint: `PATCH /v2/testsmarter/projects/{projectId}`
Payload tested: `{ "ProjectStatusId": 662751 }`
REST response: `200 Project updated successfully.`
Source readback: SQL `tblProject.intProjectStatuesId` changed to `662751`.
Conclusion: this is the correct v2 project status PATCH field.

Tool: `update_project`
Fields exposed by MCP: `Description`, `PriorityId`, `StartDate`, `EndDate`
REST endpoint: `PATCH /v2/testsmarter/projects/{projectId}`
Payload tested: `{ "Description": "...", "PriorityId": 407149, "StartDate": "2026-08-01", "EndDate": "2026-08-31" }`
REST response: `200 Project updated successfully.`
Source readback: SQL `ntextDescription`, `intProjectPriorityId`, `dtsProjStart`, `dtsProjDue` matched.
Conclusion: these field names are valid.

Tool: `create_task` / `update_task`
Field exposed by MCP: `Description`
REST endpoint: `POST/PATCH /v2/testsmarter/projects/{projectId}/tasks[/taskId]`
Payload tested: `{ "Description": "..." }`
REST response: generic success.
Source readback: SQL `tblTask.ntextDetail` stayed empty/unchanged.
Conclusion: ignored by v2 task writes. REST expects `Details`; MCP should accept `Description` as an alias and send `Details`.

Tool: `create_task` / `update_task`
Fields expected by REST: `Details`, `StatusId`, `TypeId`, `PriorityId`, `StartDate`, `EndDate`
REST endpoint: `POST/PATCH /v2/testsmarter/projects/{projectId}/tasks[/taskId]`
Payload tested: `{ "Details": "...", "StatusId": 544585, "TypeId": 612756, "PriorityId": 407062, "StartDate": "2026-07-06", "EndDate": "2026-07-10" }`
REST response: generic success.
Source readback: SQL `ntextDetail`, `intTaskStatusId`, `intTaskTypeId`, `intTaskPriorityId`, `dtsTaskStart`, `dtsTaskDue` matched.
Conclusion: these field names are valid.

Tool: `update_task`
Field exposed by MCP: `PercentComplete`
REST endpoint: `PATCH /v2/testsmarter/projects/{projectId}/tasks/{taskId}`
Payload tested: `{ "PercentComplete": 37 }`
REST response: `200` generic success.
Source readback: no matching `tblTaskFollowUp` row; task details unchanged.
Conclusion: ignored by task PATCH. MCP should reject this field until a progress/follow-up write is implemented.

Tool: `create_risk`
Fields exposed by MCP: `Impact`, `Probability`
REST endpoint: `POST /v2/testsmarter/projects/{projectId}/risks`
Payload tested: `{ "Impact": 203566, "Probability": 203527, "LevelId": 152548, ... }`
REST response: `400 Bad Request`.
Source readback: no risk inserted.
Conclusion: REST expects `ImpactId` and `ProbabilityId`.

Tool: `create_risk`
Fields expected by REST: `TypeId`, `StatusId`, `ImpactId`, `ProbabilityId`, `LevelId`, `MitigationPlan`
REST endpoint: `POST /v2/testsmarter/projects/{projectId}/risks`
Payload tested: base IDs from reference data plus SQL risk level base ID.
REST response: `201 Risk Inserted Successfully`.
Source readback: SQL `tblRisk.intRiskKindId`, `intRiskStatusId`, `intRiskImpactId`, `intRiskProbabilityId`, `intRiskLevalId`, `ntextMitigationPlan` matched.
Conclusion: risk writes require base IDs and `LevelId`; no v2 `risklevels` reference endpoint exists.

Tool: `create_issue`
Fields exposed by MCP: `TypeId`, `StatusId`, `Resolution`, `Severity`
REST endpoint: `POST /v2/testsmarter/projects/{projectId}/issues`
Payload tested: `{ "TypeId": 820, "StatusId": 547, "Resolution": "...", "Severity": 2 }`
REST response: `400 Bad Request`.
Source readback: no issue inserted.
Conclusion: `TypeId`/`StatusId` are ignored by issue REST, `Resolution`/`Severity` are unsupported aliases.

Tool: `create_issue`
Fields expected by REST: `Type`, `Status`, `FinalResolution`
REST endpoint: `POST /v2/testsmarter/projects/{projectId}/issues`
Payload tested: `{ "Type": 820, "Status": 547, "FinalResolution": "..." }`
REST response: `201`.
Source readback: SQL `tblIssue.intIssueTypeId`, `intIssueStatusId`, `strIssueFinalResolution` matched.
Conclusion: MCP should map `TypeId -> Type`, `StatusId -> Status`, and `Resolution -> FinalResolution`.

## Problem

An MCP write tool reported success while the requested business change did not happen. This is a serious contract mismatch between the MCP tool schema and the v2 REST API contract.

Known incident:

- User asked MCP to set project `72735` / `testcopy_1612` to `Closed`.
- MCP called `update_project({"projectId":72735,"StatusId":662753})`.
- ITM API returned:

```json
{"Id":72735,"StatusMessage":"Project updated successfully.","StatusCode":200}
```

- The UI and source database still show the project as `In Progress`.
- The prior MCP session incorrectly assumed this was DataMart eventual consistency.

This ticket is not just to fix `StatusId` vs `ProjectStatusId`. Do a full audit of every MCP tool and every exposed input/output contract, fix all feasible mismatches, and add tests that prove writes actually mutate the intended fields.

## Key Findings From Investigation

The local docs to read first:

- `../README.md`
- `../DEBUGGING.md`
- `../ENVIRONMENTS-AND-ACCESS.md`
- `../ITM-API-VERSIONING.md`
- `README.md`
- `zz_Tickets/first-interaction-mcp.txt`

Source of truth database:

```powershell
sqlcmd -S "TROJANHORSE\SQLEXPRESS" -U appuser -P "Itm@2022" -d "ITM_App-2025-5-22-6-33" -Q "SELECT ..."
```

Observed DB state after the failed status update:

```sql
SELECT
  p.intProjectId,
  p.strProjectName,
  p.intProjectStatuesId,
  ps.intProjectStatusBaseId,
  ps.strProjectStatusName,
  p.dtsUpdate
FROM dbo.tblProject p
LEFT JOIN dbo.tblProjectStatus ps
  ON p.intProjectStatuesId = ps.intProjectStatusBaseId
 AND ps.intAccountId = p.intAccountId
 AND ps.intLanguageId = 1
WHERE p.intProjectId = 72735;
```

Result:

```text
intProjectId | strProjectName | intProjectStatuesId | intProjectStatusBaseId | strProjectStatusName | dtsUpdate
72735        | testcopy_1612  | 662752              | 662752                 | In Progress          | 2026-05-14 15:58:09.683
```

Relevant project statuses:

```text
base id 662752 = In Progress
base id 662753 = Closed
```

The row was saved at `2026-05-14 15:58:09.683`, so the PATCH reached the API and persisted a project update. It simply persisted the old status.

## Root Cause For Known Incident

MCP exposes/sends `StatusId` for project status:

- `src/tools/write-tools.ts`
- `update_project` schema has `StatusId`
- `splitUpdateProjectArgs` forwards the body unchanged
- `clients.rest.patch(path, body)` sends that body to v2 REST

ITM.Tasks project PATCH does not apply project status from `StatusId`:

- `../ITM.Tasks/ITM.Tasks/Controllers/ProjectController.cs`
  - `PATCH v2/{AccountId}/Projects/{ProjectId}`
  - Reads request body as `JObject details`
  - Calls `ProjectManager.UpdateProject(...)`
- `../ITM.Tasks/ITM.Tasks/ProjectManager.cs`
  - `UpdateProject(...)` loads the project, calls `project.UpdateProjectDetailsWithValuesSuppliedByUser(false, details)`, then calls `ProcessProjectStatusId(...)`
  - `ProcessProjectStatusId(...)` only checks `details.SelectToken("ProjectStatusId")`
- `../ITM.Tasks/ITM.Tasks/Project.cs`
  - `UpdateProjectDetailsWithValuesSuppliedByUser(...)` updates many fields, but does not update `Status` from `StatusId`
- `../ITM.Tasks/ITM.Tasks/DA/ProjectManagerDA.cs`
  - `UpdateProjectDetail(...)` writes `intProjectStatuesId = @StatuesId`
  - `@StatuesId` is `project.Status?.Id`, which stayed as the original `662752`

So `StatusId` was silently ignored, while the API still returned a generic successful update response.

## Why Existing Tests Missed It

Current MCP E2E test only updates description:

- `tests/e2e/write-tools.e2e.test.ts`
- Test name: `update_project updates project fields`
- It sends only `Description`

Current unit test for `splitUpdateProjectArgs` only verifies pass-through behavior and does not know the real API contract.

## Scope

Audit every MCP tool, especially write tools:

- `create_task`
- `update_task`
- `create_risk`
- `create_issue`
- `update_project`
- `get_reference_data`
- all read tools backed by DataMart and REST

## Mandatory Fact-Check Before Implementation

Before making any code changes, verify every suspected contract with live local API calls. Do not infer the correct field names, ID semantics, response shape, or persistence behavior from code alone.

For each MCP tool and each field it exposes:

- Call the corresponding local v2 REST endpoint directly through `http://localhost/ITM.API/...`.
- Send the exact candidate payload shape.
- Read back the changed entity from v2 REST source-of-truth immediately after the write.
- When needed, query SQL to verify the backing column changed.
- Only then implement the MCP mapping/validation.

Document the fact-check result in the ticket or in test comments for each audited field:

```text
Tool:
Field exposed by MCP:
REST endpoint:
Payload tested:
REST response:
Source readback:
SQL readback if relevant:
Conclusion:
```

This is required because the known incident looked successful from the API response but did not mutate the requested status. A `200` response is not enough evidence.

## TODO: Clarify Silent PATCH Ignore Behavior

Investigate and document exactly why the v2 PATCH path silently ignored `StatusId` for project status while still returning `200 Project updated successfully`.

Questions to answer:

- Is silent ignore of unknown or unsupported PATCH fields an intentional API design across v2, or an accidental behavior of `Update...WithValuesSuppliedByUser` methods?
- Does this happen only for project status, or for many fields across project/task/risk/issue endpoints?
- Are ignored fields ever reported to callers through validation errors, warnings, API logs, or audit logs?
- Should ITM.Tasks treat unsupported supplied fields as validation errors?
- Should MCP defensively detect ignored fields even if the REST API continues allowing them?

If confirmed as general v2 behavior, decide whether to open/fix an ITM.Tasks/API bug. At minimum, document the decision and rationale. This matters because the current behavior can make clients believe data changed when it did not.

For each tool, compare:

- MCP input schema in `src/tools/*.ts`
- path/body built by MCP
- actual v2 controller route and manager update method in `../ITM.Tasks` or `../ITM.Account`
- field names expected by `Update...WithValuesSuppliedByUser`, `ValueHelper.GetUpdatedValue`, or equivalent code
- ID semantics: base id vs language-specific row id
- response semantics: whether the API returns only `DetailResponseMessage` or a full updated entity
- readback source: SQL/v2 REST source of truth vs DataMart eventual read model

Do not trust a `200` + `Project updated successfully` response as proof that a field changed. Some v2 PATCH endpoints silently ignore unknown fields.

## Required Fixes

At minimum:

1. Fix project status update.
   - Either expose `ProjectStatusId` in `update_project`, or keep public MCP `StatusId` for consistency but map it to `ProjectStatusId` before calling REST.
   - Prefer the user-facing schema that is least confusing across tools, but make the REST payload match ITM.Tasks.
   - Preserve backward compatibility if possible. If both names are accepted, reject conflicting values.

2. Add verified write responses.
   - For writes where REST returns only `DetailResponseMessage`, read back from source of truth after the write.
   - Validate intended mutable fields actually match the requested values when practical.
   - If a requested field did not change, return an MCP error instead of a success message plus stale notice.
   - Keep DataMart stale notice, but do not call REST success "confirmed state" unless there was an actual source-of-truth readback or the API returned the updated entity.

3. Audit all other field names.
   - Look for mismatches like `StatusId` vs `ProjectStatusId`, `PriorityId` vs expected names, base IDs vs localized IDs, date names, assignee/team fields, progress fields, risk/issue status/type fields, etc.
   - Pay special attention to project because it has legacy names like `intProjectStatuesId` and special status request logic.

4. Improve audit logging reliability.
   - `tblMcpAuditLog` currently exists but had no rows during this incident.
   - Determine whether stdio/API-key sessions use a no-op audit client or whether audit POSTs are failing.
   - Write tests for the chosen behavior.
   - If audit is intended for all writes, ensure all write paths insert rows or clearly document why local stdio is excluded.

## Test Requirements

Add comprehensive unit, integration, and E2E tests.

### Unit Tests

Add/extend tests around:

- argument normalization for every write tool
- `StatusId` -> `ProjectStatusId` mapping if that compatibility layer is chosen
- rejection of conflicting aliases, for example `StatusId=662752` and `ProjectStatusId=662753`
- write response verification behavior
- error when requested fields are missing from readback or do not match
- audit wrapper behavior if audit is fixed/changed

### Integration Tests

Add tests that call the local REST client against local ITM.API/ITM.Tasks when available:

- update project description and verify source REST readback
- update project status and verify `tblProject.intProjectStatuesId`
- update project priority/type/date fields if exposed by MCP
- update task status/date/progress/assignee and verify source readback
- create/update risk and issue fields, verifying source state or returned entity

Use local credentials from `../ENVIRONMENTS-AND-ACCESS.md` / `.env`.

### E2E Tests

Add MCP-level E2E tests that run through the actual tool surface:

- create or select a disposable test project; do not rely on or mutate `72735` unless explicitly approved
- call `get_reference_data("projectstatuses")` and choose two valid statuses dynamically
- call `update_project` to move status from A to B
- verify via v2 REST or SQL that the source status changed
- verify DataMart eventually reflects it, but do not use DataMart as the immediate write confirmation
- restore original status or clean up test data

Current `tests/e2e/write-tools.e2e.test.ts` only verifies description update for projects. Expand it materially.

## Useful Commands

Run unit tests:

```powershell
npm test
```

Build:

```powershell
npm run build
```

Run E2E tests:

```powershell
npm run test:e2e
```

Query current project/source status:

```powershell
sqlcmd -S "TROJANHORSE\SQLEXPRESS" -U appuser -P "Itm@2022" -d "ITM_App-2025-5-22-6-33" -W -s "|" -Q "SET NOCOUNT ON; SELECT p.intProjectId, p.strProjectName, p.intProjectStatuesId, ps.strProjectStatusName, p.dtsUpdate FROM dbo.tblProject p LEFT JOIN dbo.tblProjectStatus ps ON p.intProjectStatuesId = ps.intProjectStatusBaseId AND ps.intAccountId = p.intAccountId AND ps.intLanguageId = 1 WHERE p.intProjectId = 72735;"
```

Use local API token:

```powershell
$apiKey = (Select-String -Path .env -Pattern '^ITM_API_KEY=').Line.Split('=')[1]
$login = Invoke-RestMethod -Uri "http://localhost/ITM.API/testsmarter/login/$apiKey" -Method Get
$token = if ($login.Token) { $login.Token } elseif ($login.token) { $login.token } else { $login }
```

Read project from v2 REST:

```powershell
Invoke-RestMethod -Uri 'http://localhost/ITM.API/v2/testsmarter/Projects/72735' -Headers @{ token = [string]$token } -Method Get | ConvertTo-Json -Depth 8
```

Search project from v2 REST:

```powershell
$body = @{ filter = @{ Name = @{ '$regex' = 'testcopy_1612' }; IsActive = @{ '$in' = @(1) } } } | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://localhost/ITM.API/v2/testsmarter/Projects/Search?paged=false' -Headers @{ token = [string]$token } -Method Post -ContentType 'application/json; charset=UTF-8' -Body $body | ConvertTo-Json -Depth 8
```

Check local app logs:

```powershell
Get-Content C:\logs\ITM.Tasks.log | Select-String -Pattern "72735|Update Project|Validation Error|Error executing" -Context 1,2
Get-Content C:\logs\ITM.API.log | Select-String -Pattern "72735|Projects/72735|Project updated|Error" -Context 1,2
```

Check SQL error/audit tables:

```sql
SELECT TOP 20 * FROM dbo.TblAPIErrorLog ORDER BY CreatedDate DESC;
SELECT TOP 20 * FROM dbo.ErrorLog ORDER BY ErrorDate DESC;
SELECT TOP 20 * FROM dbo.tblMcpAuditLog ORDER BY Id DESC;
SELECT TOP 20 * FROM dbo.tblProjectStatusRequest WHERE intProjectId = 72735 ORDER BY intProjectStatusRequestId DESC;
```

## Acceptance Criteria

- No MCP write tool claims a field changed solely because v2 REST returned a generic success message.
- `update_project` can successfully change project status using valid reference data.
- Field-name and ID semantics are documented in code or tests for each write tool.
- All detected contract mismatches are fixed or explicitly documented as unsupported.
- Unit tests cover argument mapping and readback verification.
- Integration tests verify source-of-truth mutations for all practical write fields.
- E2E tests exercise project status change through the MCP tool surface and verify SQL/v2 REST source state.
- The stale DataMart notice is still present, but it cannot mask a failed source write.
- `npm test`, `npm run build`, and applicable E2E/integration tests pass.

## Notes For New Agent

- Start from the repo root `C:\Users\dpire\Code\ITMPlatform\ITM.MCP`.
- The parent folder contains multiple repos. For v2 project/task/risk/issue behavior, inspect `../ITM.Tasks` first.
- `ITM.Web/ITM.API/APIGateway.json` routes local `http://localhost/ITM.API/v2/testsmarter/...` calls to the right microservice.
- DataMart is useful for read tools but is not the immediate source of truth for write verification.
- Be careful with project `72735`; it is evidence for this incident, not a test fixture.
- Prefer creating disposable fixtures or restoring modified records in E2E/integration tests.
