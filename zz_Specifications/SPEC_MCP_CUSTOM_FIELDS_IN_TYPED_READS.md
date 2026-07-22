# SPEC: Custom Fields in Typed Read Tools (get_project / get_service / search)

> **Date:** 2026-07-22
> **Driver:** Same Ucloud request as [SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md](SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md);
> this is the complementary "option 3" layer: surface custom field values in the typed read
> path so single-entity reads need no DataMart knowledge at all.
> **Scope:** projection changes only; no new tools, no backend changes.
> **Status:** Proposed (not scheduled). Implement after the discovery spec ships and its
> real-world usage is observed; the discovery layer may prove sufficient.

---

## 1. Design

All data already flows through DataMart component documents, which carry `customFields` (see the
discovery spec for verification). This spec only widens projections.

| Tool | Change | Default |
|---|---|---|
| `get_project` | add `customFields: 1` to the projection | **On** (always returned) |
| `get_service` | same | **On** |
| `search_projects` | new optional boolean `includeCustomFields`; when true, add `customFields: 1` to `DEFAULT_PROJECT_FIELDS` | Off |
| `search_services` | same | Off |
| `search_tasks` / subcomponent pages | out of scope for now; task-level custom fields are reachable via `query_datamart` (`tasks.customFields` dot paths) and rarely requested | -- |

Implementation points:

- [graphql-queries.ts:15-21](../src/tools/graphql-queries.ts#L15-L21) `DEFAULT_PROJECT_FIELDS`
  stays unchanged (search default lean); `get_project` builds on it via
  [buildGetProjectProjection](../src/tools/projects.ts#L39-L46), which gains the unconditional
  `customFields: 1` entry (idempotent with the discovery spec's context feature).
- Tool descriptions gain one line: custom field values are returned under `customFields`, keyed
  by display name; definitions via `get_custom_fields`.

## 2. Why default-on for single reads and opt-in for lists

- A single component's `customFields` is small (one value per defined field), and
  `result-size-guard` already protects tool output size. Default-on means a model that knows
  nothing about custom fields still surfaces them for "show me project X".
- Lists multiply the payload by up to 200 rows; Text/HTML custom fields are unbounded
  (`ntext` in SQL), so lists stay opt-in.

## 3. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Output shape change breaks a consumer parsing `get_project` output | Additive key only; note in changelog. MCP consumers are LLMs; no known scripted consumers of tool output. |
| Huge HTML custom field bloats a single read | `result-size-guard` truncation already applies to all tool output. |
| Accounts with dozens of fields add noise to every read | Acceptable; the alternative (opt-in include) recreates the discoverability gap this work exists to close. Revisit with a per-account cap if it bites. |

## 4. Tests (when implemented)

- Unit: `buildGetProjectProjection` includes `customFields`; `search_projects` variables include
  it only when `includeCustomFields: true`.
- E2E (local): `get_project` on a seeded project returns the `customFields` map with the known
  local keys; `search_projects` with and without the flag.

## 5. Dependencies

Ships independently of, but is motivated by, `SPEC_MCP_CUSTOM_FIELDS_DISCOVERY.md`. No
out-of-repo impacts.
