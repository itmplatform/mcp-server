# SPEC: Task assignment via create_task / update_task (TaskManagers, TaskMembers)

> **Drivers:**
> [Help Scout 11710](https://secure.helpscout.net/conversation/3403398037/11710/) (Gilsandro Cezar, Ucloud PMO): assign users to tasks via MCP; today assignment must happen manually in the UI before hours can be estimated via MCP.
> [Help Scout 11715](https://secure.helpscout.net/conversation/3404221417/11715/) (Ronald Gomez, Teams4Soft): could not assign resources from ChatGPT.
> Third and fourth requests for the same capability (earlier: 11586 point 2, 11634).
> **Origin:** follow-up candidate documented in
> [done/SPEC_MCP_CREATE_PROJECT_HIERARCHY_MILESTONES.md](done/SPEC_MCP_CREATE_PROJECT_HIERARCHY_MILESTONES.md) Section 6.
> **Status:** Implemented (target v1.0.17). No backend or gateway changes required.

---

## 1. Decision

Expose task assignment by extending `create_task` and `update_task` with two optional
fields, `TaskManagers` and `TaskMembers` (comma-separated usernames), instead of adding a
new tool. Rationale:

- The v2 task pipeline already honors both fields on create and update; the whole feature
  is MCP-surface only.
- No new tool name keeps the tool count at 44 and the tools/list payload well below the
  49,000-byte Claude connector budget (enforced by e2e).
- It matches the effort tools' contract: `update_task_effort` already tells agents
  "Assign them first with update_task (TaskMembers/TaskManagers accept comma-separated
  usernames)" (src/tools/effort.ts) -- that message was written ahead of this feature and
  becomes true with this spec.
- One call can create a task and assign its team, which is the Ucloud bulk-creation flow.

INDEX P2 #12/#13 (`assign_task_team` / `remove_task_team`) called the write path v1-only;
that is true for the dedicated team endpoints, but the task create/update pipeline
provides a v2 write path for **adding** users. Removal stays v1-only and out of scope.

## 2. Platform contract (verified on stage 2026-08-03, account testsmarter)

Backend chain (ITM.Tasks): `TaskManager.InsertTask`/`UpdateTask` read `TaskManagers` and
`TaskMembers` from the request JObject (TaskManager.cs:168-169, 602-603), validate them in
`TaskRulesManager.CheckTaskTeamUsers` (TaskRulesManager.cs:73-105), and apply them in
`UpdateTeamMembers` (TaskManager.cs:889-909) via `TaskUserManager.SaveTeamMembers`
(TaskUserManager.cs:167-200).

Verified behavior:

- **Format:** comma-separated usernames (`tblUser.strUsername`, the login; in practice the
  user's email address, returned as `EmailAddress` by `search_users` and by the task Users
  readback).
- **Validation:** every username is resolved against the Account microservice
  (`v2/{AccountId}/Users/{UserName}`). Any unknown username fails the whole request with
  400 and message `"<names> are not valid users."`. Nothing is written.
- **Add/upsert only:** listed users are added to the task (and auto-added to the project
  team via `EnsureProjectUser` when missing). Users absent from the list are never
  removed. There is no removal path in v2; removal remains UI/v1-only.
- **Waterfall:** `TaskManagers` rows get `IsTaskManager=true`, `TaskMembers` rows `false`.
  Re-listing an existing assignee in the other field flips their flag.
- **Kanban (and service activities):** both lists are merged and everyone is saved as a
  regular member (`IsTaskManager=false`).
- **Stakeholders** are silently skipped by the backend (`IsStackHolder` guard).
- **Readback:** `GET v2/{company}/projects/{projectId}/tasks/{taskId}/Users` exists
  through the gateway and returns `{ canAddTeam, TaskUsers: { <username>: { UserId,
  DisplayName, IsTaskManager, TaskUserId, EstimatedHours, ... } } }` -- keys are the
  usernames, which makes exact write verification possible.

Stage experiment log: create with manager+member -> both assigned with correct flags;
PATCH with a third username -> added, first two untouched; invalid username -> 400
`"nonexistent@nowhere.example are not valid users."`.

## 3. MCP surface changes

### `create_task` and `update_task`: two new optional fields

| Field | Type | Description (schema text, kept short for the catalog budget) |
|-------|------|-------------------------------------------------------------|
| `TaskManagers` | `z.string().optional()` | Comma-separated usernames to add as task managers (Waterfall; Kanban adds them as members). Add-only: never removes existing assignees. Usernames come from search_users EmailAddress. |
| `TaskMembers` | `z.string().optional()` | Comma-separated usernames to add as team members. Add-only: never removes existing assignees. |

The `AssignedToUserId` rejection stays but its message now points to
`TaskManagers`/`TaskMembers` instead of "task team endpoints".

### Pre-write validation (new, in ITM.MCP)

- A username listed in both `TaskManagers` and `TaskMembers` in the same call is rejected
  (the backend would apply managers first and members second, silently ending as member).
- Entries are trimmed; empty entries are dropped; a field that is empty after trimming is
  removed from the body.

### Post-write verification (new, in ITM.MCP)

When either field was supplied, after the standard task readback the handler fetches
`projects/{projectId}/tasks/{taskId}/Users` and verifies (case-insensitive on username):

- every requested username is present in `TaskUsers` (catches the silent stakeholder
  skip), and
- on Waterfall projects the `IsTaskManager` flag matches the list the user was supplied in
  (no flag check on Kanban, where everyone is saved as member).

A mismatch throws the standard "Source-of-truth write verification failed" error. The
tool response gains a compact `team` array (`Username`, `UserId`, `DisplayName`,
`IsTaskManager`) built from the same readback -- the full Users response is too verbose to
return (per-user holiday calendars).

The project is already fetched in `create_task`; `update_task` now also fetches it when
assignment fields are supplied (it previously fetched only for KindId/ParentId), both for
the Waterfall/Kanban flag decision and for the methodology-specific description of the
verification.

## 4. Interactions and caveats

- **Effort flow unblocked:** after assigning, `update_task_effort` can set per-user
  estimates in the same session; its "assign first" error message becomes actionable.
- **Hierarchy interaction (existing rule):** a task with assignees cannot be auto-promoted
  to a summary task by pointing another task's `ParentId` at it (400). Assign users to
  leaf tasks only. Already documented in the ParentId descriptions.
- **Closed projects do not block task writes** (verified on stage): assignment on a closed
  project succeeds. Not this spec's concern, documented for completeness.
- **No removal**, no `Units`/allocation percentage, no per-assignment effort in this
  surface: adding users and flipping the manager flag only.
- **Team Members licenses** cannot use MCP at all (existing rule), but they can be
  assigned to tasks by a PM/Full User session.

## 5. Tests

Unit (TDD, red-green):
- `splitCreateTaskArgs`/`splitUpdateTaskArgs` pass `TaskManagers`/`TaskMembers` through.
- Duplicate-across-lists rejection; trimming and empty-field removal.
- Team summary builder: compact array from the Users response shape.
- Team verification: missing username throws; Waterfall flag mismatch throws; Kanban skips
  the flag check; case-insensitive matching.
- Updated `AssignedToUserId` rejection message.

E2E (`tests/e2e/task-assignment.e2e.test.ts`):
- Create task with `TaskManagers` + `TaskMembers` -> readback team has both, correct flags.
- PATCH adds another member -> previous assignees survive (add-only).
- Invalid username -> tool error carries the REST validation message.
- Assign then `update_task_effort` for the newly assigned user succeeds (the 11710 flow).
- Cleanup deletes tasks and projects (existing helpers).

## 6. Documentation

- README: `create_task`/`update_task` rows mention team assignment; "What Can an Agent
  Do?" unchanged (44 tools count unchanged).
- APIDocs tool manifest regenerates from the schemas; changelog entry added (EN/ES).
- INDEX.md: P2 #12 marked resolved-for-add via this spec; removal stays open (v1-only).
