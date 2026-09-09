# MCP: assigning a non-login user to a task reports failure although the write succeeded

> **Status:** FIXED IN SOURCE 2026-09-09 (develop, not yet deployed). F1 to F3 are
> implemented in this repository as version 1.0.21 and verified with the unit suite (535
> tests) and the e2e suite against local (`task-assignment-nonlogin.e2e.test.ts`, 4 tests,
> plus the existing assignment e2e). The UI defect (P3) is fixed in ITM.Web, see its ticket:
> [2026-09-08-task-team-nonlogin-member-listed-as-available.md](../../ITM.Web/zz_Tickets/2026-09-08-task-team-nonlogin-member-listed-as-available.md).
> Pending: stage deployment and the stage check below, production release, reply to René.

## Report

Internal report by René Álvarez (email "Toolkit y MCP", 2026-09-08 09:30 UTC, Gmail
thread `1a0805b162c62a1c`). René asked Claude to assign his only non-login user,
"Claude Code", to a task. Claude answered that the assignment was not possible although
it had tried. When René opened the task's Team tab, the user appeared twice: once under
"Assigned members" with an empty Login (the correct entry) and once under "Available
members" with Login `54349`, "an ID that Claude perhaps invented". The project Team page
showed the user once, correctly assigned to the task. He left the task untouched.

René wrote "PID …014, TID 48479"; the real identifiers are project 82014 and task
2048479. His email also lists the planned Toolkit features and notes that the MCP cannot
create users; both are out of scope here (the reply draft below acknowledges them).

| Item | Value (production) |
|---|---|
| Account | `actual_solutions`, AccountId 27473 |
| Reporter user | 54301 (rene@actualsolutions.tech), Company Admin |
| Project | 82014 "ITM Platform Toolkit", Kanban (`intProjectMethodTypeId` 2), 41 tasks created by the MCP on 2026-09-08 |
| Task | 2048479 "T-82014-26090001 [Arquitectura] Backend único ASP.NET Core Web API…" |
| Non-login user | 54349, DisplayName "Claude Code", `blnIsNonLoginUser` 1, `strUsername` = '' (empty string), created 2022-03-16 |
| AI client | Anthropic/ClaudeAI over the hosted OAuth MCP |

## What actually happened

Timeline (UTC) from `dbo.tblMcpAuditLog` rows 3347 to 3354 and
`C:\inetpub\wwwroot\ITM.MCP\logs\mcp.1.log` on the production VM, read on 2026-09-09:

| Time | Tool | Result |
|---|---|---|
| 08:45:20 | `search_users` | ok |
| 08:46:40 | `get_user` | ok |
| 08:46:53 | `update_task` with `TaskMembers: "Claude Code"` | `REST request failed: 400 Bad Request -- Claude Code are not valid users.` |
| 08:47:03 | `update_task` with `TaskMembers: "54349"` (the UserId used as username) | backend PATCH succeeded, then the MCP threw `Source-of-truth write verification failed for update_task: 54349 is not on the task team after the write (stakeholder users cannot be assigned)` |
| 08:49:01 | same call again | same error |
| 08:50:55 | `get_task` | ok (the task detail carries no team fields) |
| 08:58:52 | `search_users` | ok |

The audit stores tool names and errors only; the payloads are inferred from the error
texts and confirmed by the stage reproduction.

Database state on 2026-09-09 (read-only `itm_agent_readonly` through the ITMApp VM):

- `tblProjectUser` 315314 (project 82014, user 54349) created 2026-09-08 08:47:04 by the
  first "54349" call: the MCP path adds the user to the project team automatically.
- `tblTaskUser` 1111801 (task 2048479, project user 315314, member) created 08:47:04 and
  updated 08:49:01 by the retry. It is the **only** task-team row in the whole project.
- Project team: René (manager), Claude Code (08:47:04), Elizabeth Rodríguez (manager,
  added 15:10, after the report, unrelated).
- No other account has ever produced either error text in `tblMcpAuditLog`.

So the assignment **worked on the first "54349" attempt**. The MCP misreported it, Claude
retried twice with the same idempotent result, and the "duplicate" is a display defect.

## Problems found

### P1. Contract gap: non-login users have no username to give (ITM.MCP)

`create_task` and `update_task` document `TaskManagers` / `TaskMembers` as
"comma-separated usernames (search_users EmailAddress)". `search_users` maps
`EmailAddress` from `tblUser.strUsername`, which is empty for non-login users created
through the classic Users page, and it does not return `IsNonLoginUser`. Claude had
nothing valid to send and fell back to the display name, then to the numeric UserId.

Why the display name fails and the numeric id works: ITM.Tasks
(`TaskRulesManager.CheckTaskTeamUsers`, `TaskUserManager.SaveTeamMembers`) resolves each
value with `GET {AccountMS}v2/{AccountId}/Users/{value}`. ITM.Account has two routes,
`Users/{UserName}` (exact `strUsername` match) and `Users/{IdUser:int}`; a numeric string
binds to the second, so `"54349"` resolves the user by id and the assignment proceeds.
This is undocumented but stable behaviour of the owning APIs.

Breadth (production, 2026-09-09): 921 active non-login users with an empty username in
37 accounts (450 non-login users do have one); 18 in `actual_solutions`.

### P2. Readback verification is a false negative, with a misleading message (ITM.MCP)

ITM.Tasks `TaskUserManager.GetAllUsersForTask` returns `TaskUsers` as an object keyed
by `EmailAddress`, **or by `TaskUserId` when the email is empty**:

```csharp
string userKey = string.IsNullOrEmpty(user.EmailAddress) ? user.TaskUserId.ToString() : user.EmailAddress;
```

`verifyTaskTeamReadback` in [src/tools/write-tools.ts](../src/tools/write-tools.ts)
looks the requested string ("54349") up among those keys, finds `"1111801"` instead and
throws "… is not on the task team after the write (stakeholder users cannot be
assigned)". The write is already committed, the tool reports failure, and the guess
about stakeholders is wrong. `buildTaskTeamSummary` has the same weakness: it reports the
object key as `Username`.

### P3. The task's Team tab lists the assigned non-login member as available (ITM.Web)

The "Assigned members" grid prints the username (empty), while the "Available members"
grid is keyed by username with a fallback to UserId and only hides a project user whose
key equals an assigned username. With username '' and key '54349' nothing matches, so
the same person appears in both grids and the second one shows the UserId as Login.
The redesigned Kanban popup has the same family of defect with the v2 endpoints (member
keyed by TaskUserId, add-people grid keyed by UserId); it was reproduced on stage.
Mechanism, evidence and fix proposal are in the ITM.Web ticket linked above. Nothing in
the MCP causes or can fix P3.

## Fixes mapped to problems

| Fix | Solves | Repository | What changes |
|---|---|---|---|
| F1. Verify by `UserId` | P2 | ITM.MCP | `verifyTaskTeamReadback` resolves each requested value to a readback row by `EmailAddress` (case-insensitive) or, for a numeric value, by `UserId`, ignoring the object key. `buildTaskTeamSummary` keys the summary by `UserId` and reports `Username` only when the row has one. |
| F2. Accept and document numeric ids | P1 | ITM.MCP | `TaskManagers` / `TaskMembers` officially accept a numeric `UserId` (backed by the ITM.Account `int` route); `search_users` returns `IsNonLoginUser` so agents know when to use the id. Tool descriptions, `APIDocs`, generated manifest, README and unit, scope and e2e expectations updated. |
| F3. Accurate error text | P2 | ITM.MCP | Say the user was not found on the team after the write and that ITM Platform silently skips stakeholders and unknown identifiers, instead of asserting a stakeholder cause the readback cannot show. |
| F4. Key task members consistently in the UI | P3 | ITM.Web | See the ITM.Web ticket. |

F1 to F3 were implemented with TDD on 2026-09-09 (see Implementation below). The e2e runs
against local and needs the non-login fixture described there.

## Stage reproduction (2026-09-09, testsmarter, synthetic data, cleaned up)

1. Created non-login user 64169 through the classic page
   (`UserPages/MyProfessionals.aspx?AddNewUser=1`, "No-login user" ticked, login left
   empty). `Users/Search` returned `EmailAddress: ""`, `IsNonLoginUser: true`, like
   René's user. `POST v2/{company}/Users` cannot create such a user (email required).
2. Created Kanban project 81394 and task 1866144 via v2 REST.
3. `PATCH projects/81394/tasks/1866144 {"TaskMembers":"MCP NoLogin Repro"}` →
   400 "MCP NoLogin Repro are not valid users." (P1)
4. `PATCH … {"TaskMembers":"64169"}` → 200 "Task updated successfully."; the user was
   added to the project team (ProjectUserId 297527) and to the task. (P1)
5. `GET …/tasks/1866144/users?URL=UserPages/TaskTeam.aspx` → `TaskUsers` keyed by
   `"1023475"` (the TaskUserId) with `EmailAddress: ""`, which is where the MCP
   verification fails. (P2)
6. Kanban popup: member keyed 1023475 with info panel "Email 1023475"; Add people lists
   the same user unchecked with Login 64169. (P3, popup variant; screenshots under the
   ignored `ITM.MCP/.playwright-mcp/`)
7. Cleanup: task and project deleted (project reads back 404), user 64169 deactivated
   with `PATCH v2/testsmarter/Users/64169 {"IsActive": false}` (reads back
   `IsActive: false`). One readback of the deleted task returned the usual stage 500,
   which the stage notifier may have emailed.

## Impact

- Non-login users cannot be assigned through the MCP as documented. An agent that
  guesses the numeric id succeeds but is told it failed, which invites retries and
  misinforms the user. The retries are idempotent, so no data is corrupted.
- The same readback keying will bite any tool that verifies a non-login member by
  username; `get_task_effort`, `update_task_effort` and `log_time_entry` hints send
  users to `TaskMembers` usernames.

## Implementation (2026-09-09)

| Fix | Change | Where |
|---|---|---|
| F1 | `verifyTaskTeamReadback` resolves a digits-only value by `UserId` and anything else by the row `EmailAddress` (or the object key when the row has no email field), never by the object key alone. `buildTaskTeamSummary` reports `Username: null` for members without a username. | [src/tools/write-tools.ts](../src/tools/write-tools.ts) |
| F2 | `TaskManagers` / `TaskMembers` descriptions accept numeric UserIds; `search_users` returns `IsNonLoginUser` and says when to use the id. Hints in `update_task_effort` and `log_time_entry` updated. README rows, changelog (en, es) v1.0.21, regenerated `APIDocs/src/content/tool-manifest.json`. REST OpenAPI in ITM.Web documents `TaskManagers` / `TaskMembers` on task create and update. | `src/tools/users.ts`, `src/tools/effort.ts`, `src/tools/time-entries.ts`, `README.md`, `APIDocs/` |
| F3 | The missing-user message no longer claims a stakeholder cause; it says ITM Platform silently skips stakeholders and unknown identifiers and points to `search_users` and the project role. | `src/tools/write-tools.ts` |

Tests: `tests/unit/tools/write-tools.test.ts` (non-login readback block), `tests/unit/tools/users.test.ts`,
`tests/e2e/task-assignment-nonlogin.e2e.test.ts` (needs an active non-login user without a login name in
the e2e account; local testsmarter has "MCP E2E NoLogin", UserId 66450, created 2026-09-09 through the
classic Users page; stage testsmarter has user 64169, reactivated the same day for the stage check).

Stage check after deployment: through the hosted stage MCP, `update_task` with `TaskMembers: "64169"`
on a synthetic task must return a `team` row with `UserId 64169` and `Username null`, and
`search_users` must list the user with `IsNonLoginUser: true`.

## Reply to René (draft, Spanish, in the existing thread)

```text
Hello R.

Resulta que la asignación sí se hizo a la primera. El MCP se equivocó al decirte que había fallado (y Claude lo reintentó dos veces sin efecto: la tarea tiene un único miembro).

Los usuarios sin login no tienen nombre de usuario, que es lo que pide la herramienta, así que Claude probó con el id numérico y el backend lo aceptó. Después el MCP comprueba el equipo de la tarea y ahí no reconoce a los usuarios sin login porque el API los devuelve con otro id. Lo del "duplicado" con un id en Login es un fallo aparte de la pestaña Equipo de la tarea, que tampoco los reconoce y enseña su id interno. Claude no se inventó nada. Los dos tienen ticket.

Mientras tanto, para asignar usuarios sin login pasa el UserId en TaskMembers (te lo da search_users). La escritura funciona aunque la herramienta devuelva error.

Ya puedes tocar la tarea. Gracias por dejarla intacta, ha ayudado. De la lista del Toolkit te digo aparte.

d
```
