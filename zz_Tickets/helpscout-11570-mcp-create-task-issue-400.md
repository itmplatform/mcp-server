# Help Scout 11570 — MCP `create_task` / `create_issue` return 400

Date investigated: 2026-07-13  
Help Scout conversation: `3385099189` / ticket `11570`  
Customer: uCloud (`ucloud`, account `29908`, user `62847`)  
Severity: High  
Diagnosis: Confirmed  
Implementation: Completed locally; pending review/deployment

## Executive summary

This is not a recent REST API v2 regression. It is an MCP input-contract and documentation mismatch:

- `create_task` tells AI clients that only `projectId` and `Name` are required, while the downstream task API requires additional values for Waterfall projects. Both reported projects are Waterfall projects. The customer's most complete task request still omitted `EndDate`, so it was rejected by the existing Waterfall validation.
- `create_issue` also tells AI clients that only `projectId` and `Name` are required, while the issue API requires a valid issue type and status. The reported issue request supplied neither.
- The MCP REST client discards the downstream validation response body. Claude therefore sees only `REST request failed: 400 Bad Request` instead of the actionable messages produced by ITM.Tasks.

The REST validations that rejected these calls date from 2020–2021. Recent production deployments did not introduce them.

## Ticket and attachment review

The Help Scout API returned six threads: the customer report, its internal translation, the acknowledgement, and system line items. There are no attached files or screenshots. The images embedded in the original HTML are email-signature graphics, not diagnostic attachments.

The customer reported:

- `create_task` with `Name` and `projectId` -> 400.
- Adding task status `1088345`, type `1036439`, priority `691781`, and `StartDate` in successive attempts -> still 400.
- The same result in projects `77595` and `78251`.
- `create_issue` with `Name` and `projectId` -> 400.
- Read tools work normally.

## Production evidence

### MCP audit trail

`dbo.tblMcpAuditLog` contains the exact incident sequence (UTC):

| Time | Tool | Project inferred from MCP log | Result |
|---|---|---:|---|
| 14:22:35 | `create_task` | 77595 | 400 |
| 14:22:52 | `create_task` | 77595 | 400 |
| 14:23:01 | `create_task` | 77595 | 400 |
| 14:23:12 | `create_task` | 77595 | 400 |
| 14:23:19 | `create_task` | 78251 | 400 |
| 14:23:32 | `create_task` | 78251 | 400 |
| 14:23:50 | `create_issue` | 78251 | 400 |

All seven calls belong to user `62847` and are recorded as `Anthropic/ClaudeAI`. Reads and reference-data calls immediately before and between the writes succeeded.

### Service logs

The MCP log records the expected POST paths and 400 responses. The ITM.Tasks production log independently confirms that every request reached the correct controller and failed business validation:

- Six `ValidationException` entries from `TaskController.InsertTask`, for the two reported project IDs, at the same timestamps.
- One `ValidationException` from `IssueController.InsertIssue`, account `29908`, at `14:23:50`.
- The task stack points to `TaskManager.InsertTaskDetail` line 184, which is the branch that throws after `CheckValidation` returns invalid.

This rules out OAuth scope, gateway routing, customer identity, and general MCP connectivity as causes.

### Project and reference data

Production SQL confirms:

| Project | Name | Method | Active |
|---:|---|---|---|
| 77595 | `[Automas] Asistente Virtual Telefónico` | Waterfall (`intProjectMethodTypeId = 1`) | Yes |
| 78251 | `[UCLOUD] - Actividades Comerciales y Preventa` | Waterfall (`intProjectMethodTypeId = 1`) | Yes |

The task IDs supplied by the customer are valid active account references for a non-activity Waterfall task:

| Field | ID | Label | Base ID |
|---|---:|---|---:|
| `StatusId` | 1088345 | Pendiente | 1088345 |
| `TypeId` | 1036439 | Genérica | 1036439 |
| `PriorityId` | 691781 | Normal | 691781 |

The reference IDs were therefore not the cause of the final task attempt.

## Root cause

### `create_task`

The MCP tool schema in `src/tools/write-tools.ts` marks only `projectId` and `Name` as required; `StatusId`, `StartDate`, and `EndDate` are optional. The generated API documentation has the same contract.

For Waterfall projects, ITM.Tasks runs these validations in `TaskManager.CheckValidation`:

- task name;
- priority and type (the manager can supply account defaults when configured);
- start date;
- end date;
- status.

The customer's first requests lacked status and both dates. Later requests added status and `StartDate`, but none of the reported payloads included `EndDate`. `TaskRulesManager.CheckEndDate` therefore adds `Please enter task end date.` and the controller returns 400.

This behavior is conditional on project methodology. Kanban tasks receive default board status/swimlane values and do not run the Waterfall start/end/status checks. The existing MCP E2E fixture does not explicitly create a Waterfall project, so it did not protect this customer path.

### `create_issue`

The MCP tool schema again marks only `projectId` and `Name` as required; `TypeId` and `StatusId` are optional.

The downstream API is not optional here. `Issue.UpdateDetailsWithValuesSuppliedByUser` maps REST fields `Type` and `Status`, and `IssueManager.CheckValidation` rejects the object when either resolved reference is null. The MCP correctly maps `TypeId -> Type` and `StatusId -> Status`, but it cannot do that when the caller is told those inputs are optional and omits them.

The reported `Name + projectId` request consequently fails with the server validations `Please enter valid issue type ID.` and `Please enter valid issue status ID.`

### Why Claude receives only a generic 400

`src/clients/rest-client.ts` throws immediately on a non-2xx response using only `response.status` and `response.statusText`. It never reads the JSON response body. ITM.Tasks returns a `DetailResponseMessage` containing the accumulated validation messages, but MCP discards it before logging or returning the error.

That loss of detail caused Claude to retry several field combinations instead of identifying the missing fields on the first failure.

## No recent REST contract change

- Git blame dates the Waterfall task name/type/priority/date/status validation to November 2020.
- Git blame dates mandatory issue type and status validation to November–December 2021.
- The latest ITM.Tasks production deployment before the incident was commit `0939a4e` on 2026-07-09, but those old validation lines were unchanged.
- The production MCP deployment was commit `aac1630` on 2026-07-08 and still advertises the mismatched optional fields.

The failure is therefore a long-standing contract gap exposed by this customer's valid Waterfall use case, not a recent API change.

## Implemented resolution

The MCP fix now implements the methodology-aware design described below:

- `create_task` reads the project before posting. It returns a structured MCP validation error when a Waterfall call omits `StatusId`, `StartDate`, or `EndDate`, while Kanban calls retain their board-default behavior.
- `create_issue` publishes `TypeId` and `StatusId` as required inputs, so Claude must construct both arguments before the handler can run.
- The shared REST client retains a downstream JSON `StatusMessage`, strips HTML formatting, bounds the returned detail to 2,000 characters, and falls back safely to bounded plain text.
- The generated MCP manifest, README, and English/Spanish changelogs document the corrected contract.

Verification completed on 2026-07-13:

- 286 unit tests passed across 32 files.
- 51 focused contract/error tests passed, including the new TDD cases.
- Four local REST integration tests passed.
- All 46 local MCP E2E tests passed across 12 files. The expanded write suite covers required issue inputs, Waterfall preflight, valid Waterfall creation, Kanban creation without Waterfall-only fields, downstream validation-message preservation, source-of-truth readback, and cleanup.
- The same five ticket-specific MCP assertions also passed against the deployed stage API before the complete local run.
- E2E projects and tasks were removed after the run.
- The MCP TypeScript build and generated API documentation production build passed at version `1.0.9`.

The local IIS worker temporarily became unresponsive during an early project-cleanup request. The two interrupted fixtures were verified by ID/name and removed directly from the local test database. The worker subsequently recovered, after which both the REST integration suite and the complete local MCP E2E suite passed with normal API cleanup.

## Suggested solution

### P0 — Align the MCP contract with downstream validation

1. Make `TypeId` and `StatusId` required in the `create_issue` Zod schema and descriptions. Continue normalizing localized `Id` values to REST `BaseId` values.
2. Make `create_task` methodology-aware:
   - Read the source project from v2 REST before posting.
   - For Waterfall projects, require `StartDate`, `EndDate`, and `StatusId` and return a clear MCP validation error before calling POST.
   - Keep type and priority optional only while the account has valid defaults; otherwise return a clear preflight validation error or require them too.
   - For Kanban projects, use the board-specific status/default behavior. Do not tell the model to use Waterfall `gettaskstatuses` IDs as though they were universally valid Kanban column IDs.
3. Regenerate the tool manifest/API documentation so Claude receives the corrected required fields.

A simpler immediate patch is to require `StartDate`, `EndDate`, and `StatusId` for every `create_task` call. That will unblock these Waterfall projects, but methodology-aware validation is the safer final design because Kanban has a different status model.

### P0 — Preserve downstream validation details

Change `rest-client.ts` to read the response body before throwing. Return a safe error such as:

```text
REST request failed: 400 Bad Request — Please enter task end date.
```

Parse `StatusMessage` from JSON when available, fall back to bounded response text, and avoid logging credentials or authorization headers. This should also improve every other MCP write tool.

### Tests required

- Unit-test the published schemas/manifest so `create_issue` cannot regress to optional type/status.
- Add a Waterfall `create_task` test that proves missing start date, end date, or status fails locally with a clear preflight message.
- Add a full valid Waterfall task creation test and source-of-truth readback.
- Add a valid Kanban task test separately; do not rely on an implicit project-method default.
- Add `create_issue` tests for missing type, missing status, and a valid normalized localized ID/BaseId pair.
- Add REST-client tests proving a downstream `DetailResponseMessage.StatusMessage` is retained in the MCP error and that non-JSON/oversized bodies are handled safely.

## Temporary workaround limitations

There is no reliable customer-side workaround in Claude. The end user does not construct the MCP payload directly; Claude chooses the tool and arguments from the published schema. Because that schema currently says the fields are optional, Claude may continue to omit them.

The customer could explicitly instruct Claude to call `create_task` with every field below, but this is only a best-effort prompt workaround and should not be presented as a dependable solution. For internal reproduction, the expected payload shape using the customer's known valid references is:

```json
{
  "projectId": 77595,
  "Name": "Task name",
  "StatusId": 1088345,
  "TypeId": 1036439,
  "PriorityId": 691781,
  "StartDate": "2026-07-13",
  "EndDate": "2026-07-17"
}
```

The end date must be on or after the start date. This exact production write was not executed during diagnosis; the expectation is based on the confirmed project method, valid customer references, production validation path, and existing source-of-truth integration coverage.

Likewise, an explicit prompt could ask Claude to call `get_reference_data` for `issuetypes` and `issuestatuses` and then include both selected IDs in `create_issue`, but the user cannot guarantee that Claude will produce this payload:

```json
{
  "projectId": 78251,
  "Name": "Issue name",
  "TypeId": 78200,
  "StatusId": 52191
}
```

The current MCP normalizes either localized IDs or BaseIds before calling REST. The dependable resolution is to correct the tool schema/runtime validation and redeploy MCP.

## Secondary data-quality finding

Account `29908` has the Spanish labels for its two issue-status base records reversed:

- open/default base `52191` is labeled `Cerrada` in Spanish;
- closed base `52192` is labeled `Abierta` in Spanish.

This did not cause the 400, but it can make an AI or user choose the semantically wrong status after the required-field fix. Correct the localized labels as a separate data cleanup.

## Recommended support response

> Hemos confirmado la causa. No se trata de un cambio reciente de la API REST. La definición actual de las herramientas MCP marca como opcionales algunos campos que la API necesita. En proyectos Waterfall, `create_task` requiere también `StartDate`, `EndDate` y un `StatusId` válido; en sus pruebas faltaba `EndDate`. `create_issue` requiere `TypeId` y `StatusId`, aunque la definición actual no los muestra como obligatorios. Como Claude construye internamente los parámetros de estas herramientas, no existe una solución temporal fiable que pueda aplicar desde su lado. Vamos a corregir el contrato de las herramientas y a mejorar el mensaje de error para que Claude envíe los campos necesarios y muestre la validación concreta en lugar de un 400 genérico.
