# Ticket: Prevent Large MCP Project Payloads From Exhausting Claude Context

Created: 2026-06-24
Severity: High
Area: ITM.MCP, DataMart read tools, hosted MCP observability, APIDocs

## Problem

A production user successfully authenticated to the hosted MCP server from Claude, but Claude then reported:

> Esta conversación es demasiado larga para continuar. Inicia un nuevo chat o elimina algunas herramientas para liberar espacio.

The user summarized the issue as:

> Ahora logre autenticar pero parece que los datos que retorna el servidor son muy grandes y se acaban la ventana de contexto.

This is not an OAuth failure or an ITM server error. It is an MCP result-size/context-window problem.

## Production Evidence

Important limitation:

- We do not have the user's natural-language prompt to Claude. The hosted MCP server does not log Claude chat messages.
- We only know the MCP-side evidence: OAuth/session events, tool names, audited parameter hashes, recovered tool arguments, timestamps, durations, and reproduced DataMart responses.
- The user intent below is therefore inferred from the tools Claude chose to call, not from the original prompt text.

User:

- Email: `lmoreno@ucloudstore.com`
- Name: Luis Moreno
- `UserId`: `62585`
- `AccountId`: `29908`
- Account slug: `ucloud`
- Account name: `CU2 CLOUD TEC SORE SL`
- AI client: `Anthropic/ClaudeAI`

MCP audit rows from `tblMcpAuditLog` on 2026-06-23:

| UTC timestamp | Tool | Args recovered from audit hash | Duration |
|---|---|---|---|
| `2026-06-23 19:31:01.360` | `search_projects` | `{ "query": "informa" }` | 127 ms |
| `2026-06-23 19:31:08.340` | `get_project` | `{ "projectId": 77934, "include": ["tasks","budget","risks","issues"] }` | 87 ms |
| `2026-06-23 19:31:22.587` | `search_projects` | `{ "query": "informa", "limit": 10 }` | 30 ms |
| `2026-06-23 19:31:24.793` | `get_project` | `{ "projectId": 77934, "include": ["tasks","risks","issues","budget"] }` | 80 ms |

Project:

- `ProjectId`: `77934`
- Name: `[INFORMA] - Aprovisionamiento de DR en GCP`
- Project number: `PR-29908-25110007`
- Status: `En ejecución`
- SQL child counts: `189` tasks, `6` risks, `0` issues

Measured exact MCP/DataMart result sizes:

- `search_projects` result for `query="informa"`: `618` UTF-8 bytes, roughly `155` tokens.
- `get_project` result with `tasks`, `budget`, `risks`, `issues`: `251,147` UTF-8 bytes, roughly `62,695` tokens.
- Claude received two near-identical `get_project` results, so tool output alone was about `502 KB`, roughly `125k` tokens.

Top-level payload breakdown for the large `get_project` result:

| Top-level field | UTF-8 bytes |
|---|---:|
| `tasks` | `230,155` |
| `risks` | `3,970` |
| `budgetBottomUp` | `317` |
| `budgetTopDown` | `284` |
| `budgetActual` | `279` |
| `budgetPeriodEndClose` | `206` |

The task payload dominates the response. DataMart returns `189` full denormalized task objects. Each task contains `35` fields, including flags, dates, manager/team display names, effort metrics, status labels, sprint names, and other metadata.

## DataMart Artifacts

Exact reconstructed DataMart request and full response are stored in this ticket folder:

- Query: [mcp-large-project-payload-datamart-query.json](mcp-large-project-payload-datamart-query.json)
- Response: [mcp-large-project-payload-datamart-response.json](mcp-large-project-payload-datamart-response.json)

Artifact notes:

- The query file contains the GraphQL body sent to DataMart for the first large `get_project` call.
- The response file contains the full GraphQL response body returned by DataMart.
- No auth token, session token, password, or request header is stored in either artifact.
- The response artifact contains production UCloud project data and should be treated as customer data.

## Investigation References

The investigation started from `../README.md`, which points agents to the shared access and debugging docs. The relevant references used were:

- `../README.md`: documentation index and instruction to use environment/debugging docs for production access, logs, and database access.
- `../ENVIRONMENTS-AND-ACCESS.md`: production VM SSH pattern, production Azure SQL connection details, and credential locations in `.env`.
- `../DEBUGGING.md`: tools server logging/MongoDB notes, API log locations, production SQL monitoring notes, and the Hosted MCP Server section added during this investigation.
- `README.md`: hosted MCP endpoint and tool capability overview for this repo.
- DataMart docs: https://developers.itmplatform.com/datamart/ for the intended projection, pagination, schema, and nested-array query design.

No secrets from those docs are copied into this ticket.

## Root Cause

MCP did not follow DataMart's existing safe-query design for heavy nested arrays.

DataMart intentionally stores a project/service as one component document with subcomponent arrays, but callers are expected to avoid projecting entire arrays. The [DataMart GraphQL Guide](https://developers.itmplatform.com/datamart/) explicitly warns to use dot notation for array fields and never project an entire array such as `"tasks": 1`. DataMart also exposes schema resources, projections, `limit`/`skip` for component lists, `$slice` for nested arrays, and `$unwind` aggregations when a caller needs rows from a subcomponent collection.

MCP collapsed this into a friendly but unsafe shortcut: `get_project(include: ["tasks"])` projected the whole embedded task array.

Relevant code:

- `src/tools/projects.ts`
  - `INCLUDE_MAP.tasks = { tasks: 1 }`
  - `get_project` serializes the entire DataMart component with `JSON.stringify(data.component, null, 2)`
- `src/tools/tasks.ts`
  - `list_project_tasks` also projects `{ tasks: 1 }`
  - It serializes the full task array with `JSON.stringify(tasks, null, 2)`

This is hazardous for MCP clients because a single project can contain hundreds of tasks, and every task is returned as a full denormalized object. Claude then stores those tool results inside the conversation context. Repeating a large call can exhaust the client context even when the ITM API call is fast and successful.

This is not a DataMart limitation. It is an MCP wrapper design bug.

## Current Observability Gaps

The investigation required reconstructing details across logs and audit rows.

Current MCP audit has:

- `ToolName`
- `ParametersHash`
- `Success`
- `DurationMs`
- `AiClientId`

Current MCP audit does not have:

- raw args
- response byte size
- result item counts
- truncation/omission metadata
- warning/error classification for oversized responses

The raw args were recovered only because `ParametersHash` is `sha256(JSON.stringify(args))` and the possible arguments were small enough to brute force. That will not be generally practical.

## Target Design

MCP should mirror DataMart's safe separation:

- Details tools return only the component itself.
- Subcomponent collections are queried explicitly through separate tools.
- Details tools include subcomponent counts and query guidance, not subcomponent arrays.
- Collection tools follow DataMart-style pagination and projection semantics.
- A result-size guard exists as a safety backstop, not as the primary design.

## Recommended Fixes

### 1. Remove Subcomponent Arrays From Detail Tools

Change `get_project` and `get_service` so they never return full subcomponent arrays.

Project subcomponents affected:

- `tasks`
- `purchases`
- `revenues`
- `risks`
- `issues`

Service subcomponents affected:

- `activities`
- `purchases`
- `revenues`

This means removing or changing the current `include` semantics. The current `include` contract is unsafe because it makes `include: ["tasks"]` look harmless while it actually returns the entire embedded task array.

Preferred behavior:

- `get_project({ projectId })` returns project-level fields only.
- `get_service({ serviceId })` returns service-level fields only.
- No detail tool should project `tasks: 1`, `purchases: 1`, `revenues: 1`, `risks: 1`, `issues: 1`, or `activities: 1`.

Backward compatibility option:

- Keep the `include` parameter temporarily, but ignore subcomponent array includes and return an explicit warning.
- Alternatively fail fast when a caller asks for subcomponent arrays:

```text
Subcomponents are not returned by get_project. Use list_project_tasks, get_project_purchases, get_project_revenues, get_project_risks, or get_project_issues with pagination.
```

Do not silently return partial subcomponent data from `get_project`.

### 2. Return Subcomponent Counts And Query Guidance

Detail tools should include a compact `subcomponents` summary so MCP clients know what is available and how to ask for it.

Do not include task previews or first-N subcomponent samples in `get_project`. Previews can mislead the model into answering from an incomplete sample, and they still encourage broad detail calls.

Suggested `get_project` shape:

```json
{
  "id": 77934,
  "name": "[INFORMA] - Aprovisionamiento de DR en GCP",
  "code": "PR-29908-25110007",
  "componentType": "project",
  "statusLabel": "En ejecución",
  "percentComplete": 0,
  "startDate": "2025-11-10T00:00:00.000Z",
  "endDate": "2026-04-24T00:00:00.000Z",
  "subcomponents": {
    "tasks": {
      "count": 189,
      "tool": "list_project_tasks",
      "pagination": { "limit": 50, "skip": 0, "maxLimit": 200 },
      "schemaResource": "itm://schema/tasks",
      "projectionHint": "Use task fields explicitly; never request the whole tasks array."
    },
    "risks": {
      "count": 6,
      "tool": "get_project_risks"
    },
    "issues": {
      "count": 0,
      "tool": "get_project_issues"
    },
    "purchases": {
      "tool": "get_project_purchases"
    },
    "revenues": {
      "tool": "get_project_revenues"
    }
  }
}
```

Counts can be computed through one of these approaches:

- use DataMart aggregation with `$project` / `$size` where available;
- use a narrow DataMart projection that returns only array IDs and count locally;
- use existing REST endpoints if cheaper and already available;
- as a fallback, omit count and still return query guidance.

Do not fetch full subcomponent arrays solely to count them unless the response is guaranteed small or projected to IDs only.

### 3. Make Subcomponent Tools Explicit And DataMart-Aligned

Subcomponent tools should be the only typed tools that return subcomponent collections.

Existing project tools to update:

- `list_project_tasks`
- `get_project_purchases`
- `get_project_revenues`
- `get_project_risks`
- `get_project_issues`

Existing service tools to update if affected:

- `get_service` / service subcomponent retrieval helpers
- any service activity, purchase, or revenue collection tool

All collection tools should:

- require parent component id;
- accept `limit` and `skip`;
- default `limit` to a safe value such as `50`;
- cap `limit` at DataMart's max of `200`;
- return `items`, `total`, `limit`, `skip`, and `hasMore`;
- use narrow projections / dot notation;
- never project the entire embedded array with `tasks: 1`, `purchases: 1`, etc.

Suggested collection response shape:

```json
{
  "items": [],
  "total": 189,
  "limit": 50,
  "skip": 0,
  "hasMore": true,
  "schemaResource": "itm://schema/tasks",
  "projection": ["id", "number", "name", "statusLabel", "percentComplete", "startDate", "endDate"]
}
```

For embedded arrays, DataMart's raw implementation may use `$slice`, dot-notation projection, or `$unwind` aggregation. MCP should hide that implementation detail and expose the same user-facing semantics DataMart teaches: explicit projection, `limit`, `skip`, `total`.

### 4. Surface Schema And Query Clues To MCP Clients

MCP already exposes DataMart schema resources:

- `itm://schema/component`
- `itm://schema/tasks`
- `itm://schema/purchases`
- `itm://schema/risks`
- `itm://schema/issues`

The problem is that many MCP clients/models do not naturally inspect resources before calling tools. Typed tool results should therefore include concise schema/query guidance where it matters.

Recommended improvements:

- Add `schemaResource` and `projectionHint` metadata in detail-tool `subcomponents` summaries.
- Add schema links/hints to subcomponent collection responses.
- Consider adding a typed `get_datamart_schema` or `get_subcomponent_schema` tool if resources are not reliably used by Claude and other clients.
- Update APIDocs and tool descriptions to match the DataMart design.

Current `get_project` description says:

> Get full project details by ID, optionally including subcomponents (tasks, risks, issues, budget, purchases, revenues). One query returns everything requested.

Replace it with language that tells agents:

- use `get_project` for project-level details and subcomponent counts;
- use explicit list/detail tools for tasks, purchases, revenues, risks, and issues;
- use pagination for subcomponent collections;
- do not request full embedded arrays.

### 5. Keep `query_datamart`, But Guard It

`query_datamart` is useful for advanced users and agent workflows, but it exposes raw DataMart power. It should keep DataMart-like flexibility while rejecting obvious context bombs.

Update `query_datamart` validation to reject full heavy-array projections:

- `tasks: 1`
- `purchases: 1`
- `revenues: 1`
- `risks: 1`
- `issues: 1`
- `activities: 1`

Allow safe alternatives:

- dot-notation projection such as `"tasks.name": 1`;
- `$slice` for nested arrays, if supported by the validator;
- `$unwind` pipelines with final `$limit`;
- component-level projections that exclude heavy arrays.

Validation message example:

```text
Projection "tasks: 1" is too broad for MCP. Use dot notation such as "tasks.id": 1 and "tasks.name": 1, or use list_project_tasks with limit/skip.
```

### 6. Add A Shared MCP Result-Size Guard

Add a shared result-size guard as a backstop for all JSON-returning tools. This is not the main fix; the main fix is safe query design. The guard protects against missed cases, raw `query_datamart`, unexpected tenant data, and future tools.

Helper behavior:

- serialize with `JSON.stringify(value, null, 2)`;
- measure `Buffer.byteLength(..., "utf8")`;
- warn above a configurable threshold;
- fail or return a structured safe response above a hard threshold;
- never truncate JSON mid-object silently.

Suggested defaults:

- warning threshold: `50 KB`;
- hard threshold: `100 KB`;
- env override: `MCP_MAX_TOOL_RESULT_BYTES`.

Oversized response example:

```text
Result too large to return safely: 251147 bytes.
Use the explicit subcomponent tools with limit/skip and narrow fields.
```

### 7. Add Response Metrics To Audit

Extend MCP instrumentation and audit logging to record result metadata.

Suggested additions to `tblMcpAuditLog`:

- `ResponseBytes INT NULL`
- `ResultItemCount INT NULL`
- `WasTruncated BIT NOT NULL DEFAULT 0`
- `Warning NVARCHAR(512) NULL`

Suggested MCP-side log fields:

- `tool`
- `userId`
- `accountId`
- `aiClientId`
- `durationMs`
- `responseBytes`
- `resultItemCount`
- `wasTruncated`

Do not log full response bodies or sensitive raw payloads.

### 8. Consider Recording Safe Argument Summaries For Auditing

The current `ParametersHash` is privacy-preserving but makes incident investigation slow. Consider adding one of:

- `ParametersSummary NVARCHAR(512)` such as `projectId=77934 include=tasks,budget,risks,issues`
- `ParametersJsonRedacted NVARCHAR(MAX)` only if product/security approves storing known-safe tool args

This should avoid storing secrets and customer free text unless explicitly approved. A short deterministic summary is probably enough for incident analysis.

### 9. Add Regression Tests

Unit tests:

- `get_project` never projects or returns full subcomponent arrays.
- `get_project` returns subcomponent counts/query guidance.
- `list_project_tasks` honors `limit` and `skip`.
- project purchase/revenue/risk/issue tools honor `limit` and `skip` where applicable.
- `query_datamart` rejects full heavy-array projections such as `tasks: 1`.
- result-size guard rejects oversized JSON and reports byte count plus suggested next query.
- tool descriptions mention explicit subcomponent tools and pagination.

Integration/E2E tests:

- Use a fixture or mocked DataMart response with `200+` tasks.
- Verify no MCP tool returns more than the configured byte budget.
- Verify `get_project` returns no full subcomponent arrays and includes `subcomponents.tasks.count`.
- Verify `list_project_tasks({ limit: 10 })` returns exactly 10 items and `hasMore=true`.
- Verify raw `query_datamart` fails for `{ "tasks": 1 }` and succeeds for safe dot-notation fields.

Production-safe verification:

- Reproduce against project `77934` with a read-only token.
- Confirm `get_project` response is under the configured threshold and does not include `tasks`.
- Confirm `list_project_tasks({ projectId: 77934, limit: 10 })` returns a paginated task page.
- Confirm Claude receives a useful response rather than exhausting context.

## Suggested Implementation Plan

1. Remove full subcomponent projections from `get_project` and `get_service`.
2. Add subcomponent counts and query guidance to detail-tool responses.
3. Update project and service subcomponent tools to use DataMart-style `limit`, `skip`, `total`, and narrow projections.
4. Update `query_datamart` validation to reject broad heavy-array projections such as `tasks: 1`.
5. Add the shared result-size guard and wrap JSON-returning tools.
6. Update tool descriptions and regenerate/update the APIDocs manifest.
7. Add audit response-size fields and migration in `../ITM.Account`.
8. Deploy to stage, test against project `77934` or another large project, then deploy to prod.

## Acceptance Criteria

- A single MCP tool result cannot silently return a 250 KB project JSON blob to Claude.
- `get_project` on project `77934` does not include `tasks`, `purchases`, `revenues`, `risks`, or `issues` arrays.
- `get_project` returns subcomponent counts and explicit guidance for querying tasks, purchases, revenues, risks, and issues.
- `get_service` follows the same rule for activities, purchases, and revenues.
- `list_project_tasks` and other subcomponent collection tools support DataMart-style pagination and do not return all children by default.
- `query_datamart` rejects broad heavy-array projections such as `tasks: 1` and points callers to dot notation or typed subcomponent tools.
- Oversized responses are logged with byte size and safe metadata.
- Claude can continue the conversation after querying a large project.
- Unit tests cover detail-tool no-subcomponent behavior, subcomponent count/guidance behavior, result-size guard, and pagination behavior.
- E2E or integration test covers a large-task project scenario.
- Public docs/tool descriptions steer agents toward explicit subcomponent tools and away from bulk component dumps.

## Notes

- `../DEBUGGING.md` now has a Hosted MCP Server section with production log paths and audit-query examples.
- Be careful not to treat fast API duration as evidence that the result is safe. The two problematic `get_project` calls completed in under 100 ms each, but still produced roughly 63k tokens apiece.
- This ticket is about read payload safety, not OAuth. OAuth succeeded for the reported user.
