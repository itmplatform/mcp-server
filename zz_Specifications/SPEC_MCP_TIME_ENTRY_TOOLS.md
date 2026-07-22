# SPEC: MCP time entry tool (delegated actuals) -- decision record and design

> **Date:** 2026-07-22
> **Driver:** [Help Scout 11634](https://secure.helpscout.net/conversation/3393666030/11634/) (Gilsandro Cezar, Ucloud PMO):
> "Permitir indicar el Usuario (User) al realizar el registro de horas (Time Entry) de una tarea."
> **Relation:** the estimation half of 11634 is delivered by
> [SPEC_MCP_TASK_EFFORT_TOOLS.md](SPEC_MCP_TASK_EFFORT_TOOLS.md).
> This spec covers the **actuals** half: logging worked hours, including on behalf of another user.
> **Status:** Deferred by explicit product decision (2026-07-22): revisit **after** the estimation
> tools ship and Gilsandro's expected volume is known. The design below is intended to be
> implementation-ready when green-lit.

---

## 1. Decision history and reasoning (why this was deferred, and what has changed)

Recorded so the next evaluation does not restart from zero.

### 1.1 The original deferral (2026-07-13, HS 11535)

[SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md](SPEC_HELPSCOUT_11535_TIME_TRACKING_FOLLOWUP_REPORTING.md)
Section 3 deferred MCP time-entry tools on two grounds:

1. **Wrong surface:** the customer's need was read as "get Clockify history into ITM", which is
   a connector job (bulk, scheduled, reconcilable), not an interactive model-driven tool.
2. **Product stance on impersonation:** "The user is always the authenticated caller. No
   `userId` parameter." On-behalf writes were considered a connector capability, not an AI-client one.

The REST layer itself was never the blocker once the impersonation defect was fixed: the
platform explicitly preserved a **secured** `UserId` field for legitimate on-behalf consumers.

### 1.2 What has changed since (verified 2026-07-22)

1. **The secured REST contract is live in production.** The `POST /{account}/timehours` fix
   ([ITM.Web ticket](../../ITM.Web/zz_Tickets/done/2026-07-13-timehours-userid-impersonation.md))
   is deployed: prod build of 2026-07-20 contains `TimeEntryAuthorizationPolicy` and no longer
   contains the removed `TokenValidationByUserId` helper (verified by inspecting the deployed
   `ITM.BusinessAccess.dll` on the production VM). Rule: caller token always validated;
   self-service for every license; another user's `UserId` requires Company Admin or Full Access;
   tenant/task/entity, assignment, and editability checks before writes.
2. **The customer clarified the use case.** He did not answer the 2026-07-14 questions in 11535;
   instead he opened 11634 asking for per-user estimation **and** per-user time logging through
   MCP. That describes agent-driven day-to-day PMO operation, not a one-time migration.
3. **Capability parity already exists.** We told Gilsandro on 2026-07-14 (11535 reply) that the
   documented REST endpoint supports on-behalf writes with an Admin/Full Access API key. Any
   agent that can issue HTTP calls can therefore already do delegated time writes today,
   with none of the guardrails an MCP tool would enforce.

### 1.3 The case for and against, condensed

**For:** third ask from the flagship MCP customer; the security groundwork is done and deployed;
delegation is the only shape MCP time logging can take (Team Members are blocked from MCP);
refusing the tool does not prevent delegated agent writes, it only pushes them to raw REST where
the replace-semantics trap is unguarded; cross-system agent orchestration (Clockify MCP -> ITM
MCP) is a pattern our own README advertises.

**Against (residual):** a time entry is an audit-sensitive assertion ("person X worked N hours"),
feeding actual cost and potentially billing, with no source column in `tblTaskTime` to
distinguish agent writes and no bulk-undo; the REST write is a **replace** keyed on
user+task+date, exactly the semantic a model gets wrong ("add 2h" over an existing 6h yields 2);
`mcp:write` consent does not distinguish "may log hours in colleagues' names"; and if the real
workflow is recurring bulk sync from Clockify, an agent loop is the worst tool for it
(slow, token-expensive, unreconcilable) compared to the
[Clockify connector](../../ITM.Connector/zz_Specifications/clockify-time-sync/clockify-time-sync.md).

### 1.4 The decision (2026-07-22)

Ship estimation first ([SPEC_MCP_TASK_EFFORT_TOOLS.md](SPEC_MCP_TASK_EFFORT_TOOLS.md)); when
communicating it in HS 11634, remind Gilsandro that on-behalf actuals already work through the
documented REST endpoint, and ask one narrow question: **expected entries per week through the
agent**. Low volume, interactive -> build this tool. High volume, batch-shaped -> prioritize the
Clockify connector instead (or as well). Then decide.

## 2. Platform contract the tool would ride on (verified, from the ITM.Web ticket)

- Endpoint: `POST /{AccountName}/timehours` (v1 gateway; no v2 equivalent exists in ITM.Tasks).
  Auth: `Token` header from API-key login, or the session identity MCP already holds.
- Body: `{ UserId?: int, TimeReports: [{ ... task, entity, date, minutes, BillingCategoryId?, NonBillableMins?, comment? ... }] }`.
- Authorization (server-enforced, deployed): self writes for every license; on-behalf positive
  `UserId` only for Company Admin or Full Access; negative `UserId` -> 400; cross-account
  target -> 403; target must be assigned to the task and the entry editable (the old `ispublic`
  bypass is removed).
- **Semantics: replace, not append.** The effective key is user + task + date; posting a total
  replaces the existing total for that key. Types: only "actual effort, direct hours"
  (`intTimeEntryType = 2`) is writable; time-range entries (type 1) have no public write API;
  accepted effort is derived and must never be written.
- Per-row failure contract: HTTP 200 wrapper with body `StatusCode = 400` and an `Errors` array.
- Side effects on success: `tblTaskTime`/comments, `tblTask.hasTimeEntries`,
  `numTotalActualCost` recalc, accepted-effort recalc when automatic, extension events.

MCP integration note: the MCP server currently builds v2 URLs (`rest-client.ts` prepends
`/v2/{company}`), so this tool needs a small v1 request path (same gateway host, no `/v2`
prefix, `Token` header semantics). This is the only new plumbing.

## 3. Proposed tool design (for when it is green-lit)

One tool, deliberately narrow: **one user + one task + one date per call.** No batch input; bulk
migration is explicitly out of scope (connector territory).

### `log_time_entry` (write, `mcp:write`)

- Input: `projectId`, `taskId`, `date` (YYYY-MM-DD), `hours`/`minutes` (the worked time),
  `userId?` (defaults to the caller), `mode: 'set' | 'add'` (required, no default),
  `comment?`.
- Handler flow:
  1. Scope guard; if `userId` differs from the session user, pre-check the caller is Company
     Admin or Full Access (mirror of the server rule, for a friendly error instead of a 403).
  2. **Read first** (GET `/{account}/timehours` for user+task+date): obtain the existing total.
  3. `mode: 'add'` -> write existing + new; `mode: 'set'` -> write the new total. The response
     always states both the previous and the new total, so the model and the human can catch a
     wrong-mode mistake immediately.
  4. Confirm by re-reading and return the saved state (standard write-confirmation pattern).
- Description must state the replace semantics, the assignment/editability requirements, and
  that on-behalf writes require Company Admin or Full Access and are attributed to the target
  user in ITM Platform.
- Guardrails to consider at implementation: reject dates in the future; cap `hours` at 24/day;
  optional read tool `get_time_entries(projectId, taskId, userId?, dateRange)` for verification
  workflows (same GET, self or Admin/Full Access).

### Explicitly rejected shapes

- No batch/multi-row input (ETL belongs to the connector).
- No accepted-effort writes, ever.
- No silent default mode: the caller must choose `set` or `add` every time.

## 4. Open questions

1. Gilsandro's expected weekly volume through the agent (asked when announcing estimation).
2. Whether OAuth consent should call out on-behalf time writes explicitly (today `mcp:write`
   is all-or-nothing) -- relates to [SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md](SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md).
3. Whether the Clockify connector stays on the roadmap if this ships (recommendation: yes for
   bulk history; the tool and the connector serve different shapes of the same need).
