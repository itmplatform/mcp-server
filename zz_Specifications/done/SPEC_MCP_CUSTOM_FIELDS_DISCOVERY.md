# SPEC: Custom Fields Discovery (get_custom_fields + per-account context)

> **Date:** 2026-07-22
> **Driver:** Ucloud request (Gilsandro Cezar, Help Scout): expose 10 project custom fields
> ("Tipo De Fondos", "COD_FINANZAS", "Enlace Hubspot", ...) through MCP.
> **Backlog source:** [INDEX.md](INDEX.md) P8 #37 (`get_custom_fields`), #38 (`get_custom_field_options`),
> plus a new cross-cutting feature: per-account custom-field context injected into the session.
> **Scope:** 2 new read tools + dynamic MCP `instructions` and `query_datamart` description enrichment.
> **Status:** In progress.

---

## 1. Background (diagnosis, 2026-07-22)

Custom field values are **already** synced into DataMart: the writer requests `AllCustomFields`
and stores the whole map verbatim under `customFields` on every component document
(`ITM.DataMart/writer/entities/component.ts:90`, schema `z.record(z.string(), z.any())`).
Verified against prod Mongo for tenant `ucloud`: 215/215 project docs carry all 10 requested
fields with values matching SQL, re-synced within minutes of edits.

`query_datamart` already passes them through: the validator restricts operators and heavy
arrays, never field names ([query-validator.ts](../src/validation/query-validator.ts)).
The gap is **discoverability**: nothing tells the AI client that `customFields` exists or which
keys this account uses. All 9 Ucloud `query_datamart` calls (reconstructed from DataMart reader
logs) never touched `customFields`; one call even returned the full map unnoticed.

This spec closes the gap in two layers:

- **Tools (P8 #37/#38):** on-demand definitions and dropdown options, on every client.
- **Session context:** per-account list of the DataMart `customFields` keys actually in use,
  injected into the MCP `initialize` `instructions` and appended to the `query_datamart` tool
  description, so natural questions work without the user knowing the feature exists.

## 2. Verified backend facts

Searched (house rule): `CustomField` in DATABASE_SCHEMA.md (tables + procs); `custom` in ITM.MCP
src/tests/specs (no tool exists; P8 rows and INDEX coverage "None"); `customFields` in
ITM.DataMart (writer mapping, validate.ts, schema route); `CustomFieldController` traced in
ITM.Tasks and the ITM.API gateway; empirical probes below.

Backend implementation ([CustomFieldController.cs](../../ITM.Tasks/ITM.Tasks/Controllers/CustomFieldController.cs)):
all four v2 custom field routes are served by ITM.Tasks and proxied by the gateway with
`auth: token` (APIGateway.json lines 238-257, 1307-1312). Every endpoint accepts a
`?LanguageId=` query param (1=EN, 2=ES, 3=PT), **defaulting to 1 (English)**, because
definitions are stored one row per language in `tblCustomField` sharing a `BaseId`
(`CustomFieldManagerDA.cs:111-135`). Definitions are cached server-side for 24h. Entity-name to
pageId mapping (`TaskUtil.cs:460-501`): projects=57, risks=62, progressreports=63, tasks=66,
services=70, activities=94, revenues=181, issues=201, purchases=25. Type ids: Text=1, Number=2,
Percentage=3, Date=4, HTML=5, RYGList=6, DropDownList=7, List=8; only RYGList/DropDownList/List
have options.

Verified empirically against the local gateway (`http://localhost/ITM.API`, company
`testsmarter`, API-key auth) on 2026-07-22:

| Endpoint | Result |
|---|---|
| `GET v2/{co}/Projects/CustomFields` | 200 `[{Id, BaseId, Name, TypeId, TypeName, Description, Display, Required}]` |
| `GET v2/{co}/Tasks/CustomFields`, `Risks/`, `Issues/`, `Services/`, `Purchases/`, `Revenues/` | 200, same shape (empty array when none defined) |
| `GET v2/{co}/CustomFieldOptions/{baseId}` | 200 `[{Id, BaseId, CustomFieldId, Text, Color?, SortOrder, IsDefault, IsSelected}]` (`Color` for RYGList; `IsSelected` always false on this endpoint) |
| DataMart aggregate `$project {$objectToArray: $customFields}` + `$unwind` + `$group` + `$sort` + `$limit` | 200 via `v2/{co}/datamart/graphql`; returns `{_id: {key, componentType}, count}` rows. All stages pass DataMart's pipeline whitelist. |
| MCP SDK `ServerOptions.instructions` | Supported by `@modelcontextprotocol/sdk` 1.12 (`server/index.d.ts:15`), returned in `InitializeResult`. |

Language caveat (from the prod diagnosis): DataMart document keys use the display name in each
**component's** language (the writer's `AllCustomFields` map is keyed by `strCustomFieldName`
for the fetch language, `Project.cs:907-952`). When an account renames a field in only one
language (Ucloud's "Presupuesto_Original" vs "baseline_actual_horas"), the same logical field
appears under two keys, split across documents. The key-usage aggregate reflects this ground
truth (both keys appear, with partial counts), which is why the session context is sourced from
DataMart rather than from REST definitions.

## 3. Tool designs

Both are read tools (no `mcp:write` gating, not in `WRITE_TOOL_NAMES`), raw REST passthrough like
`get_reference_data`. New file `src/tools/custom-fields.ts`, registered in `server.ts`.

### `get_custom_fields`

- Input: `entity: enum('project','task','risk','issue','service','activity','purchase','revenue')`,
  `languageId?: number` (1=EN, 2=ES, 3=PT).
- Backend: `GET {Entities}/CustomFields?LanguageId={id}` (plural path map, e.g. `project` ->
  `Projects/CustomFields`). When `languageId` is omitted the tool sends the **session user's**
  language (`userContext.languageId`), not the backend default of English, so names match what
  the user sees in the UI. `registerCustomFieldTools` therefore receives `userContext` (same
  pattern as `registerProgressTools`).
- Description covers: values live in DataMart documents under `customFields`, keyed by the exact
  display `Name` (case-, accent- and whitespace-sensitive); on multilingual accounts the key
  follows each component's language, so definitions can be fetched per `languageId` (1/2/3) to
  learn variant names; dropdown (`List`/`DropDownList`/`RYGList`) option values via
  `get_custom_field_options` using `BaseId`.

### `get_custom_field_options`

- Input: `customFieldBaseId: number` (the `BaseId` from `get_custom_fields`),
  `languageId?: number` (same default behavior).
- Backend: `GET CustomFieldOptions/{customFieldBaseId}?LanguageId={id}`.
- Description notes `Text` is the value stored in DataMart `customFields` for dropdown fields,
  and `Color` appears for RYG status lists.

## 4. Per-account custom-field context (session enrichment)

New module `src/custom-field-context.ts`:

| Export | Kind | Behavior |
|---|---|---|
| `buildKeyDiscoveryPipeline()` | pure | The `$objectToArray` aggregate above, `$limit` 200. |
| `buildCustomFieldContextText(rows)` | pure | Formats the block below; returns `undefined` for no rows. Caps at 40 keys per component type ("... and N more"). Appends a dotted-key warning only when a key contains `.` (dot-notation cannot address it; use `$getField` in an aggregate or project the whole `customFields` object). Notes that keys with lower counts than siblings are usually language variants of the same field (query with `$or` across variants). Points at `get_custom_fields` / `get_custom_field_options`. |
| `buildServerInstructions(contextText)` | pure | Wraps the block for `ServerOptions.instructions`. |
| `getCustomFieldContext(company, clients, log)` | async | Runs the aggregate via `clients.datamart`; 2500 ms timeout; result (including `undefined` on empty/error) cached per company for 10 min (module-level Map, `clearCustomFieldContextCache()` exported for tests). Disabled when `ITM_CUSTOM_FIELD_CONTEXT=off`. |

Context block shape:

```
This account defines custom fields. In DataMart documents they live under "customFields",
an object keyed by the field's display name. Keys present (with document counts):
- project: "Tipo De Fondos" (215), "COD_FINANZAS" (215), "Presupuesto_Original" (101), ...
- service: "servicios campo" (7)
Query via query_datamart: project {"customFields": 1} or where {"customFields.<Key>": ...}.
Keys are case- and accent-sensitive and may contain trailing spaces.
```

Wiring in `server.ts`:

- `createMcpServer(...)` gains a `customFieldContext?: string` parameter; when set, the
  `McpServer` is constructed with `instructions` and `registerDataMartTool` receives the block to
  append to its description (after the existing static text, which independently gains a
  `customFields` mention in its "Key fields" line).
- All three startup paths fetch the context before building the server: stdio (once),
  http-oauth (per session `initialize`, cheap after the first thanks to the cache), http-dev
  (per session against the fallback identity).
- Skipped (context `undefined`, no instructions) when `userContext.dataMartAccess === 'none'`,
  on fetch failure, timeout, or empty result. PM-scoped users get keys from their scope only
  (the DataMart resolver applies pm-scope row filtering server-side).

`scripts/generate-tool-manifest.ts` sets `ITM_CUSTOM_FIELD_CONTEXT=off` in the spawned server's
env so the published APIDocs manifest stays account-neutral.

## 5. Cross-cutting changes

| Change | File |
|---|---|
| 2 new tools registered | `src/server.ts`, `src/tools/custom-fields.ts` |
| Context module | `src/custom-field-context.ts` |
| `query_datamart` static + dynamic description | `src/tools/datamart.ts` |
| Manifest generator env opt-out | `scripts/generate-tool-manifest.ts` |
| README tool tables and count (40 -> 42: 26 read, 16 write) | `README.md` |
| Tool manifest regenerated | `APIDocs/src/content/tool-manifest.json` |
| Changelog v1.0.14 | `APIDocs/src/content/sections/*/changelog.md` |
| INDEX.md: P8 #37/#38 done, coverage map, decision log | `zz_Specifications/INDEX.md` |

## 6. Tests

- **Unit (TDD):** `tests/unit/custom-field-context.test.ts` (pipeline shape ends with `$limit`;
  text formatting incl. empty -> `undefined`, per-type grouping, counts, cap, dotted-key warning
  only when applicable; cache hit/expiry with fake timers; timeout and error -> `undefined`;
  env kill-switch skips the DataMart call). `tests/unit/tools/custom-fields.test.ts` (entity ->
  path map for all 7 entities, options path, passthrough, description content).
  `tests/unit/tools/datamart.test.ts` additions (static mention; appended block when provided).
- **E2E (local):** `tests/e2e/custom-fields.e2e.test.ts` -- initialize result carries
  `instructions` naming a known local key; `tools/list` shows 42 tools and the enriched
  `query_datamart` description; `get_custom_fields(project)` returns local definitions;
  `get_custom_field_options` on the local `List` field returns options; `query_datamart`
  projecting `customFields` returns the map. Read-only, no fixtures to clean up.
- **Stage:** same checks against the deployed stage MCP via the OAuth recipe
  (`done/GUIDE_STAGE_MANUAL_TESTING.md`).

No UI changes; no ITM.UI-E2E-Testing additions (MCP has no browser surface).

## 7. Out-of-repo impacts

None. All REST endpoints and the DataMart aggregate path already exist in stage and prod (they
serve the web UI settings pages and the BI feed today). No gateway route changes: `{Entity}/CustomFields`,
`CustomFieldOptions/{id}` and `datamart/graphql` are already routed (verified empirically via the
local gateway; same routes confirmed working on prod during the 2026-07-22 diagnosis).

## 8. Customer follow-up

After prod deploy, answer Help Scout (Ucloud) with: available today via natural questions
(context feature), plus the two account-hygiene recommendations: align "Presupuesto_Original"
across the three languages and rename "SERV. ONESHOT BRL" to drop the dot. See
`project_ucloud_mcp_requests` memory for the thread state.
