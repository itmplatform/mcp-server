# MCP Project Creation, Task Hierarchy, and Milestones

> **Status:** IMPLEMENTED locally (v1.0.11, 2026-07-16) -- pending stage deployment, stage e2e re-run, and npm publish; see Section 8 for deltas found during implementation
> **Date:** 2026-07-16
> **Origin:** gap analysis from a Claude Desktop MCP session that tried to build a complete demo project (project shell + summary tasks + milestones) and hit three blockers. Two of the three "blockers" turned out to be wrong assumptions; the backend already supports everything below.

---

## Summary

Three changes, all inside ITM.MCP. No ITM.Tasks, gateway, or backend work is needed: every endpoint involved is live, gateway-routed, and publicly documented in openapi.json (`addAProjectV2`, openapi.json:2388; `addATaskV2`, openapi.json:7171).

| # | Change | What it unlocks |
|---|--------|-----------------|
| 1 | New `create_project` write tool | Agents can bootstrap a project end to end (today the project shell must be created in the UI) |
| 2 | Add `ParentId` and `KindId` to `create_task` / `update_task` | Gantt hierarchy (summary tasks + children) and real milestones via the API |
| 3 | Milestone guidance in tool descriptions + docs | Stops agents from inventing the "zero-duration task" convention; ITM has a first-class milestone kind |

Key correction to record: the AI-visible model conflated task **type** (`TypeId`: Design, Bug, Story... from `gettasktypes`) with task **kind** (`KindId`: 1=Milestone, 2=Summary, 3=Task). They are independent fields. The absence of a "Milestone" entry in `gettasktypes` is expected and irrelevant.

---

## 1. Backend Contract (verified 2026-07-16 against ITM.Tasks and ITM.Web/ITM.API sources)

There is no repo named ITM.API; v2 project/task endpoints live in the **ITM.Tasks** microservice, routed by the gateway config at `ITM.Web/ITM.API/APIGateway.json`. Neither route binds a C# DTO: the body is parsed as a raw `JObject` and fields are read by **case-sensitive string key** via `ValueHelper.GetUpdatedValue<T>` (ITM.Framework/Common/ValueHelper.cs:93-127; missing key = keep current/default value).

### 1.1 Create project

`POST v2/{AccountId}/Projects` -- `ProjectController.InsertProject`, ITM.Tasks/Controllers/ProjectController.cs:35-74. Gateway route: APIGateway.json:1114-1122 (`auth: token`, `micro: Tasks`). `UserId`/`LanguageId` arrive as query-string parameters supplied by the gateway from the authenticated token, same as all existing write tools. This route hardcodes `IsService=false` (always creates a project, never a service).

Payload keys honored on create (mapping in `Project.UpdateProjectDetailsWithValuesSuppliedByUser`, ITM.Tasks/ITM.Tasks/Project.cs:1057-1143 -- note the compiled model is the root `Project.cs` per ITM.Tasks.csproj:805; `Classes/Project.cs` is dead code):

| Key | Type | Notes |
|-----|------|-------|
| `Name` | string | **Required**: non-empty and unique per account (ProjectManager.cs:551-556) |
| `TypeId` | int | **Effectively required**: `Project.Create` sets no default type, and validation rejects null Type with "Please enter project type id." (ProjectManager.cs:613-620). Discover via `get_reference_data` entity `getprojecttypes` |
| `ProjectMethodTypeId` | int | Optional. 1=Waterfall, 2=Kanban (Enums.cs:27-30). Omitted/0 defaults to **Waterfall** (Project.cs:1061-1069). No backend validity check on other ints, so the MCP tool must constrain to 1 or 2 |
| `IsKanbanProject` | bool | Alternative to the above; only read when `ProjectMethodTypeId` is 0. The MCP tool does not expose it (redundant) |
| `Description` | string | Optional |
| `StartDate` / `EndDate` | date | Optional; end >= start enforced only when both present (ProjectManager.cs:651-655) |
| `PriorityId` | int | Optional; account default priority applied when omitted (Project.cs:30-74). Discover via `projectpriorities` |
| `ApprovalId` | int | Optional; account default applied |
| `InternalCode` | string | Optional |
| many more | | Sponsor/clients/category/business goal/ROI/revenue models etc. are honored but deferred from the MCP schema; see Section 6 |

**Silently ignored on create: `StatusId` / `ProjectStatusId`.** `InsertProject` never reads a status key (`ProcessProjectStatusId` only runs in the update path, ProjectManager.cs:228, 367-380). The project always gets the account **default** project status; a default must exist or creation fails with 400 (ProjectManager.cs:560-563). The MCP tool must therefore **reject** `StatusId` with a message pointing at `update_project`, instead of letting it be ignored.

Response is **not** the project: `{ "Id": <newId>, "StatusMessage": "Project inserted successfully.", "StatusCode": 201, "OtherDetails": null }` (DetailResponseMessage; `IsValid` is `[JsonIgnore]`). Readback: `GET v2/{AccountId}/Projects/{ProjectId}` returns the full project immediately (transaction commits before the 201; ProjectController.cs:58, 120-158). Default GET columns include `Id, No, Name, Description, StartDate, EndDate, MethodTypeId, Type, Status, Priority, ...` (Project.cs:1518-1530), sufficient for readback verification.

Side effects (all verified):
- Auto project number `No` = `PR-{AccountId}-{yyMM}{seq}` (ProjectManager.cs:530-545).
- The creating user (from the gateway token) is inserted as an active **project manager** when the license allows it (ProjectManager.cs:403-414), so OAuth/API-key identity flows into ownership correctly.
- Kanban projects get default Kanban task statuses and a swimlane created (ProjectManager.cs:391-401).
- A connector/automation event `"inserted" Project` fires (ProjectManager.cs:1536-1553).
- ExpectedROI currency defaults to the account base currency (Project.cs:1318-1323), so the "valid Expected ROI currency" validation passes without input.

### 1.2 Task hierarchy

The hierarchy field is **`ParentId`** (int), read by both POST create and PATCH update (TaskDetail.cs:721, shared parser) and persisted to `tblTask.intParentTaskId` (TaskManagerDA.cs:312, 346, 412). There is no `SummaryTaskId`, `ParentTaskId`, `WBS`, or indent field in the request contract. `ParentId` is already listed in the public openapi.json create body (typed "string" there, parsed as int in code).

Auto-promotion: pointing `ParentId` at a task that is currently a plain Task converts that parent to a **Summary** (`KindId=2`), unless the parent has assigned users or participates in a dependency, in which case the request is rejected with 400 (`TaskRulesManager.CheckParent`, TaskRulesManager.cs:132-166). Parent validation runs **only for Waterfall** (TaskManager.cs:791-797). Parent date rollups run after insert (`UpdatingParentTasksDates`, TaskManager.cs:221).

Kanban caveat: the shared parser writes `ParentId` for any methodology, but no parent validation runs for Kanban and the Kanban UI has no hierarchy. The MCP tools therefore **reject `ParentId` on Kanban projects** client-side rather than write unvalidated data.

### 1.3 Milestones and summary tasks

Milestone is a **task kind**, not a flag and not a duration convention: enum `TaskKind { Milestone = 1, Summary = 2, Task = 3 }` (ITM.Framework/Common/Enums.cs:17-22), column `tblTask.intTaskKindId`. There is no `IsMilestone` boolean anywhere.

`KindId` is read on create (TaskManager.cs:151-156) and on update (TaskManager.cs:570). It is honored though absent from the public openapi.json body docs (the gateway forwards the raw body unchanged). Two hard rules:

- **Kanban always forces `KindId` to Task** on create (TaskManager.cs:153-156). Milestones and summaries are Waterfall-only.
- **Zero-duration enforcement with a silent-demotion trap** (TaskDetail.cs:744-751): a milestone whose `StartDate` differs from `EndDate` is silently demoted to a regular Task; otherwise `StartDate` is cleared to MinValue and the milestone sits on `EndDate`. The MCP must prevent the silent demotion client-side (Section 2.2) and verify `KindId` in the readback as defense in depth.

`RevenueMilestone` (bool, TaskDetail.cs:134) is an unrelated revenue-recognition flag; do not conflate.

### 1.4 Task validation matrix by kind (Waterfall), from `TaskManager.CheckValidation` (762-806) and TaskRulesManager.cs

| Requirement | Task (3) | Milestone (1) | Summary (2) |
|---|---|---|---|
| `Name` | required | required | required |
| `TypeId` | required, but account **default applied** when omitted (TaskManager.cs:1037-1040) | resolved with default too (type resolution runs for KindId != Summary, TaskManager.cs:1004) but not validated | not applicable |
| `PriorityId` | required, account default applied (TaskManager.cs:995-998; resolution only for KindId == Task, :964) | not applicable | not applicable |
| `StatusId` | required (CheckStatus runs when KindId != Milestone, TaskRulesManager.cs:168-181) | **not required** | **required** |
| `StartDate` | required (CheckStartDate only for KindId == Task, :192-199) | must be absent or equal to `EndDate` (else silent demotion) | optional (rolls up from children) |
| `EndDate` | required (CheckEndDate for KindId != Summary, :183-190) | **required** | optional |
| Team members | allowed | **rejected** (TaskManager.cs:780-789) | rejected via summary-conversion rule |

Kanban validation is unchanged: only Kanban status/swimlane checks; no dates/status/type/priority required. This matrix also explains why the current `create_task` works without `TypeId`/`PriorityId`: the account defaults fill them in.

### 1.5 Verified NOT possible via the plain task routes (document, do not attempt)

- **Dependencies (predecessors/successors):** no standalone v2 route exists. Dependency CRUD is reachable only through the Gantt endpoint (`POST .../Tasks/Gantt`, TaskController.cs:362-410) or the Batch endpoint (`POST .../Tasks/Batch`, :862-911) with `dependencies.added/updated/removed` payloads. Candidate for a future tool (Section 6).
- **Effort/estimated hours:** `EstHour`/`EstMinutes` are `[JsonIgnore]` and never read from the task payload; effort has its own route (`.../Tasks/{TaskId}/Effort`).
- **Assignment by user ID:** unchanged; however `TaskManagers`/`TaskMembers` (comma-separated **usernames**) ARE honored on create/update (TaskManager.cs:168-169, 889-909) -- follow-up candidate, see Section 6.
- **Tags:** no such field exists on tasks.

---

## 2. Tool Specifications

All in `src/tools/write-tools.ts`, existing patterns: `server.registerTool`, `mcp:write` scope gate, `splitXxxArgs` pure helpers, POST + readback GET + `verifyRequestedFields`, `buildWriteResponse` with the stale-after-write notice. Audit logging comes free via `instrumentServer`.

### 2.1 `create_project` (new)

Input schema (zod):

| Field | Type | Notes |
|---|---|---|
| `Name` | `z.string()` | required; unique per account (400 with actionable message if duplicate) |
| `TypeId` | `z.number()` | required (Section 1.1); description points at `get_reference_data` entity `getprojecttypes` |
| `ProjectMethodTypeId` | `z.number().optional()` | 1=Waterfall (backend default when omitted), 2=Kanban. Runtime-validated to 1 or 2 |
| `Description` | `z.string().optional()` | |
| `StartDate` / `EndDate` | `z.string().optional()` | ISO 8601 |
| `PriorityId` | `z.number().optional()` | account default when omitted; `projectpriorities` entity |
| `InternalCode` | `z.string().optional()` | |

Handler:

1. Scope gate.
2. `splitCreateProjectArgs`: builds `{ path: 'projects', body }`; `rejectUnsupportedFields` for `StatusId` and `ProjectStatusId` with: "the v2 project create route ignores status; the project is created with the account default status; call update_project to change it". Runtime check `ProjectMethodTypeId` in {1, 2} when supplied.
3. `POST projects` -> `extractResponseId` -> readback `GET projects/{id}`.
4. `verifyRequestedFields` with `CREATE_PROJECT_VERIFICATION_FIELDS`: `Name`, `Description`, `StartDate`, `EndDate`, `TypeId` -> `Type.Id`, `PriorityId` -> `Priority.Id`, `ProjectMethodTypeId` -> `MethodTypeId`. All present in the default GET columns (Section 1.1).
5. `buildWriteResponse(readback)` + stale notice.

Tool description must state: Waterfall is the default methodology; status cannot be set at creation (use `update_project`); the creating user becomes the project manager; Kanban projects are created with default board columns.

**Optional UI deep link.** New optional env var `ITM_UI_URL` (no default). When set, the tool response includes `uiUrl: "{ITM_UI_URL}/{company}/UserPages/ProjectGeneral.aspx?pid={id}"` (link format verified across ITM.Web, e.g. document-list.js:1914 and TESTABILITY-GUIDELINES.md:14). When unset, the field is omitted. The var ships in the per-environment env files the pipeline deploys (verified against ENVIRONMENTS-AND-ACCESS.md): `.env.stage` = `https://new.itmplatform.com/revamping`, `.env.demo` = `https://demo.itmplatform.com`, `.env.prod` = `https://app.itmplatform.com`, local `.env` = `http://localhost/ITM.Web`. This directly serves the driving use case ("give me the link to open it in the UI").

### 2.2 `create_task` additions

New optional fields:

| Field | Type | Description highlights |
|---|---|---|
| `KindId` | `z.number().optional()` | 1=Milestone, 2=Summary task, 3=Task (default). Explicitly note this is NOT the task type (`TypeId`) |
| `ParentId` | `z.number().optional()` | ID of the parent task; a plain-Task parent is auto-converted to a summary unless it has assignees or dependencies |

`getCreateTaskValidationError` becomes kind-aware (the current rule is the Task row only):

- Waterfall + Task (omitted or 3): `StatusId`, `StartDate`, `EndDate` required (unchanged).
- Waterfall + Milestone (1): `EndDate` required; `StartDate` must be absent or equal to `EndDate` (prevents the silent demotion of Section 1.3); `StatusId` not required.
- Waterfall + Summary (2): `StatusId` required; dates optional.
- Kanban: `KindId` other than absent/3 rejected ("Kanban projects support only regular tasks; milestones and summary tasks require a Waterfall project"); `ParentId` rejected ("task hierarchy is only supported on Waterfall projects"). The project is already fetched in this flow, so no extra request.

Verification: extend `TASK_VERIFICATION_FIELDS` usage with `KindId` -> `KindId` and `ParentId` -> `ParentTask.Id` (both in the default task GET columns, TaskDetail.cs:907-915). For milestones, skip `StartDate` verification (the backend clears it by design). Verifying `KindId` doubles as a tripwire against demotion.

Tool description additions: the kind-aware requirements table in compressed form, and "milestones sit on EndDate; do not send a date range".

### 2.3 `update_task` additions

Same two fields. Differences from create:

- `update_task` currently does not fetch the project. When (and only when) `KindId` or `ParentId` is supplied, fetch `projects/{projectId}` first and apply the same Kanban rejection. Plain field updates keep their current single-PATCH flow.
- Converting an existing task to a milestone (`KindId: 1`): require `EndDate` and `StartDate` both supplied and equal in the same call. Rationale: PATCH keeps existing values for absent keys, so an existing date span would trigger the silent demotion (Section 1.3).
- **Verify during TDD (not yet confirmed in code):** whether the update path clamps `KindId` for Kanban the way the insert path does (the insert clamp at TaskManager.cs:153-156 has no confirmed update-path equivalent around :570), and the exact behavior of `ParentId: 0` for detaching a child back to root. Both get e2e tests; the detach behavior determines whether the tool documents `ParentId: 0` or rejects it.

### 2.4 Description and documentation clarifications (no code path changes)

- `create_task` / `update_task` descriptions: draw the type-vs-kind distinction explicitly; keep pointing `TypeId` discovery at `gettasktypes`.
- README `update_task` row currently says "and assignee", which the tool rejects. Fix the wording (assignment stays out of scope for this spec; see Section 6).

---

## 3. Decisions and Constraints

1. **Reject rather than ignore.** `StatusId` on `create_project`, and `KindId`/`ParentId` on Kanban, produce explicit validation errors instead of silently writing something else. Silent-ignore traps are exactly what the fact-check surfaced (backend ignores project status on create; backend demotes spanning milestones).
2. **Conservative field surface.** `create_project` exposes the seven fields above. The backend honors ~30 more (sponsor, clients, category, business goal, ROI, revenue models...); all verified available and deliberately deferred to keep the schema small. Listed in Section 1.1 so a future spec does not need to re-verify.
3. **Kind-aware validation lives client-side** because backend failures for these cases are either silent (demotion, Kanban clamp) or HTML-formatted 400s; the MCP returns deterministic, actionable messages before the write.
4. **No backend, gateway, or openapi.json changes required.** Optional follow-up in ITM.Web (separate repo, docs-only): add `KindId` and `ParentId` to the `addATaskV2` documented body, and fix the create-response example (code returns 201 "inserted successfully", the example shows 200 "created successfully").

---

## 4. TDD Plan

House rules apply: red-code-green-refactor for main logic, edge-case tests after, integration/e2e tests clean up after themselves.

### Unit (vitest, `tests/unit/tools/write-tools.test.ts` + `tests/unit/auth/scope-enforcement.test.ts`)

Red-green targets, in order:

1. `splitCreateProjectArgs`: path/body split; `StatusId` and `ProjectStatusId` rejection; `ProjectMethodTypeId` 1|2 runtime validation.
2. Kind-aware `getCreateTaskValidationError`: full matrix of Section 2.2 (Task/Milestone/Summary x Waterfall, Kanban rejections, milestone StartDate==EndDate rule).
3. `update_task` conditional project fetch + Kanban rejection + milestone conversion date rule.
4. Verification-field wiring: `KindId`/`ParentTask.Id` mappings; milestone `StartDate` exclusion; `create_project` field list.
5. `uiUrl` construction: present when `ITM_UI_URL` set, absent otherwise, no trailing-slash duplication.
6. Scope enforcement: `create_project` added to `WRITE_TOOL_NAMES`; count assertion moves 9 -> 10.

### E2E (vitest e2e config, local API per `.env`, cleanup via existing `deleteProjectViaRest`/`deleteTasksViaRest` helpers)

New `tests/e2e/create-project-hierarchy.e2e.test.ts`:

- Create Waterfall project with only `Name` + `TypeId`: readback has default status/priority, `MethodTypeId` 1, auto `No` matching `PR-...`; duplicate name yields actionable 400.
- Create Kanban project (`ProjectMethodTypeId` 2): readback `MethodTypeId` 2; then a Kanban `create_task` with `KindId: 1` is rejected client-side.
- Hierarchy: create summary (`KindId: 2` + `StatusId`), create child with `ParentId`; readback child `ParentTask.Id`; create a second child under a plain Task and verify parent auto-promotes to `KindId` 2; attempt `ParentId` pointing at a task with assignees and assert the 400 propagates.
- Milestones: create with `KindId: 1` + `EndDate` only; readback `KindId` 1; client-side rejection of a spanning milestone; `update_task` conversion with equal dates.
- `update_task` `ParentId` move between summaries; `ParentId: 0` detach probe (Section 2.3 open verification).
- `create_project` StatusId rejection message.

### UI verification (Playwright MCP, per house rules; artifacts to `.playwright-mcp/`)

After the e2e suite creates a hierarchy + milestone project on the local instance, open the project Gantt in the UI and confirm: summary row with children indented, milestone rendered as a diamond on its date, project visible with default status. Screenshot for the record, then delete the project.

### ITM.UI-E2E-Testing

Update the OAuth scope spec counts (currently 20 read / 29 total) to 20 read / 30 total. No new UI behavior is introduced by this change beyond data that existing Gantt E2E coverage already exercises.

---

## 5. Documentation Plan

| Surface | Change |
|---|---|
| `README.md` | Tool table: add `create_project` row; extend `create_task`/`update_task` rows (hierarchy, milestones); fix `update_task` "assignee" wording; counts 29 -> 30; "What Can an Agent Do?" bullet for end-to-end project bootstrap |
| `APIDocs .../en+es/changelog.md` | v1.0.11 entry: new tool (1), extended tools (2), new optional `ITM_UI_URL` |
| `APIDocs .../en+es/write-operations.md` | Add Create project row; note hierarchy/milestone support |
| `APIDocs/src/content/tool-supplement.ts` | `create_project` editorial (category Write Operations) + refresh `create_task` narrative with kind/hierarchy example |
| `APIDocs .../tool-manifest.json` | Regenerate via `scripts/generate-tool-manifest.ts` |
| `src/auth/effective-user-context.ts` | `WRITE_TOOL_NAMES` + `create_project` |
| `tests/e2e/auth.e2e.test.ts` | 29 -> 30 tool count |
| `.env.sample` + README self-hosting table | `ITM_UI_URL` (optional) |
| ITM.Web `openapi.json` (optional, separate repo) | Document `KindId`/`ParentId` on `addATaskV2`; fix create-response example (Section 3.4) |

---

## 6. Verified Follow-up Candidates (out of scope here)

Recorded with evidence so future specs skip re-verification:

1. **Task assignment via `TaskManagers` / `TaskMembers`** (comma-separated usernames) on task create/update -- honored (TaskManager.cs:168-169, 889-909), validated per username against the Account microservice (TaskRulesManager.cs:73-105). Waterfall splits managers vs members; Kanban merges both into members. Closes the "assignee" gap the README currently overpromises.
2. **Task dependencies tool** via the Gantt or Batch endpoints (Section 1.5), payload `TaskFrom`/`TaskTo`/`Type` (0=SS, 1=SF, 2=FS, 3=FF; Enums.cs:291-297) with `LagUnit`/`LagValue`. Needed for full Gantt authoring; requires its own spec (phantom-ID sync semantics).
3. **Name-based resolution** on task create/update: `TypeName`, `PriorityName`, `StatusName`, `SwimlaneName` are honored server-side (TaskManager.cs:983, 1026, 1065, 1136). Convenience aliases for agents; low priority since `get_reference_data` already covers discovery.
4. **Other honored task fields**: `Position` (ordering), `Color` (Kanban cards), `SprintId`, `DisplayInPortfolio`, `RevenueMilestone`, scheduling attributes (`SchedulingMode`, `ConstraintType`, `ConstraintDate`, `EffortDriven`, `ManuallyScheduled`, `Rollup`) -- all parsed in TaskDetail.cs:710-791.
5. **Extended `create_project` fields** (Section 1.1 table tail) including budget via the separate `PATCH .../Budget` route.

---

## 7. Rollout

1. Implement tools + unit tests (TDD) in ITM.MCP; `npm test` green. ✅ (357 tests)
2. E2E against local API; Playwright MCP Gantt verification; `npm run build` clean. ✅ (13 new e2e tests + auth + write-tools suites green; Gantt screenshot in `.playwright-mcp/gantt-hierarchy-milestone-verification.png` shows summary bracket, indented children, milestone diamond)
3. Docs of Section 5; regenerate tool manifest. ✅ (manifest v1.0.11, 30 tools)
4. Deploy to stage via pipeline (never manually), re-run e2e against stage per `ref_stage_mcp_e2e` recipe, kill any orphan MCP on port 6170 first. ⬜
5. Publish npm package (version auto-bumped by build), prod pipeline with approval. ⬜
6. Move this spec to `zz_Specifications/done/` with implementation notes for any deltas found (established convention). ⬜

---

## 8. Implementation Notes (2026-07-16, v1.0.11)

Implemented as specified, with these deltas:

- **The MCP SDK strips unknown input fields before the handler runs**, so the planned handler-side rejection of `StatusId` on `create_project` could never fire through MCP: the first e2e run created the project silently with the default status (the exact trap the spec targets). Fix: `StatusId` and `ProjectStatusId` are published in the input schema with "NOT SUPPORTED at creation" descriptions so the value reaches the handler, which rejects it with the update_project pointer. The `splitCreateProjectArgs` rejection remains as defense in depth.
- **Section 2.3 open items resolved by e2e against the local API:**
  - `ParentId: 0` detaches a task back to root and works end to end. Readback verification skips the `ParentTask.Id` check for the 0 value since a root task has no parent in the readback.
  - The Kanban clamp on the update path never needed backend verification: `update_task` fetches the project and rejects `KindId`/`ParentId` client-side before the PATCH, which e2e confirms.
- **Milestone conversion via `update_task` (equal dates in the same call) verified e2e**, as were parent auto-promotion to summary, child moves between parents, and the duplicate-name 400 passthrough.
- Coverage: 357 unit tests (32 files), 13 e2e tests in `tests/e2e/create-project-hierarchy.e2e.test.ts`, plus updated counts in `auth.e2e.test.ts` (30 tools), `scope-enforcement.test.ts` (10 write tools), and the ITM.UI-E2E-Testing OAuth scope spec (30 total).
