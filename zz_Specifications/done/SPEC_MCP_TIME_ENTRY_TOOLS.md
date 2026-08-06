# SPEC: MCP time entry tool (delegated actuals) -- decision record and design

> **Driver:** [Help Scout 11634](https://secure.helpscout.net/conversation/3393666030/11634/) (Gilsandro Cezar, Ucloud PMO):
> "Permitir indicar el Usuario (User) al realizar el registro de horas (Time Entry) de una tarea."
> **Relation:** the estimation half of 11634 shipped in
> [done/SPEC_MCP_TASK_EFFORT_TOOLS.md](done/SPEC_MCP_TASK_EFFORT_TOOLS.md) (v1.0.15). This spec
> covers the **actuals** half: logging worked hours, including on behalf of another user.
> **Status:** **IMPLEMENTED 2026-08-06** (green-lit by Daniel after the revisit trigger fired:
> [HS 11710](https://secure.helpscout.net/conversation/3403398037/11710/) re-requested time
> entries on 2026-07-30 and on 2026-08-04 answered the volume question -- continuous daily
> flow, ~50 entries/day -- resolving prerequisite 4; the tool is the right surface, not the
> Clockify connector). Shipped as `log_time_entry` per the Section 4 design (one
> user+task+date per call, mandatory set/add mode, read-first, both totals echoed), together
> with the project progress tools on the shared v1 request path (target v1.0.18). Cons 1-2
> are mitigated by the design and the license pre-check; con 3 (no source column in
> `tblTaskTime`) is accepted for now. Local unit + e2e green; stage verification pending.
> Implementation notes: the v1 GET `timehours` returns 204 No Content when the range has no
> entries (client handles empty bodies), and `teammember` accepts a UserId or username.

---

## 1. Decision

Do not build an MCP time-entry tool now. Address the cons in Section 2 first (chiefly the
destructive replace-not-append semantics acting on another person's timesheet, and the
all-or-nothing write consent). Hold until Gilsandro insists or a new request arrives.

This is a **surface decision, not a capability gap**. On-behalf actuals already work through the
REST `timehours` endpoint (Section 3), which is live in production with a secured Admin/Full
Access on-behalf rule. Building the MCP tool would make that existing capability safer and more
discoverable, not newly possible. Any HTTP-capable agent can already perform delegated time
writes today, through the raw endpoint, with none of the guardrails the tool would add.

## 2. Pros and cons

**Pros**

- **Refusing it changes nothing except safety.** The REST `timehours` endpoint is live in prod,
  the customer has been told it works, and any HTTP-capable agent can call it today. The choice
  is not "delegated agent writes: yes/no", it is "guarded or unguarded". An MCP tool with
  read-first, explicit set/add mode, and a previous-vs-new total in the response is strictly
  safer than the raw REST call he would otherwise script.
- **Security groundwork is done and deployed, not theoretical.** The Admin/Full Access on-behalf
  rule is enforced in prod; an MCP tool inherits it with zero new authorization model.
- **Delegation is the only possible shape.** Team Members are blocked from MCP, so "everyone logs
  their own hours" is structurally impossible. If MCP touches time at all, it is a PMO acting for
  others, which is exactly this use case.
- **It is the pattern we advertise.** "Claude reads Clockify and posts to ITM" is the
  cross-system orchestration the README sells; hard to tell the customer to wait for a connector
  that does not exist yet.
- **Third ask from the flagship MCP customer,** framed unambiguously as interactive agent work,
  not a one-time import.

**Cons**

- **Replace-not-append on user + task + date is the real hazard.** "Add 2h" over an existing 6h
  yields 2, and it is someone else's timesheet. Mitigated by the design (read-first, mandatory
  mode, echo both totals) but never zero for a probabilistic caller.
- **Consent granularity.** `mcp:write` is all-or-nothing; nothing in it says "may log hours in
  colleagues' names". A confused or injected session under a PMO identity has account-wide
  timesheet reach (capped only by the existing assignment/editability guards).
- **Auditability.** `tblTaskTime` has no source column, so agent-written entries are
  indistinguishable from human ones, and there is no bulk undo. This feeds actual cost and
  possibly billing.
- **Wrong tool for bulk sync.** If the real workload is a recurring weekly Clockify sync, an
  agent loop is the wrong tool and shipping it relieves the pressure to build the
  [Clockify connector](../../ITM.Connector/zz_Specifications/clockify-time-sync/clockify-time-sync.md)
  properly. The customer's expected volume resolves this.

## 3. Platform contract the tool would ride on (verified)

- Endpoint: `POST /{AccountName}/timehours` (v1 gateway; no v2 equivalent exists in ITM.Tasks).
  Auth: `Token` header from API-key login, or the session identity MCP already holds.
- Body: `{ UserId?: int, TimeReports: [{ ... task, entity, date, minutes, BillingCategoryId?, NonBillableMins?, comment? ... }] }`.
- Authorization (server-enforced, deployed): self writes for every license; on-behalf positive
  `UserId` only for Company Admin or Full Access; negative `UserId` -> 400; cross-account
  target -> 403; target must be assigned to the task and the entry editable (the old `ispublic`
  bypass is removed). Enforced by `TimeEntryAuthorizationPolicy`; the unsafe
  `TokenValidationByUserId` helper is removed. Source ticket:
  [ITM.Web/zz_Tickets/done/2026-07-13-timehours-userid-impersonation.md](../../ITM.Web/zz_Tickets/done/2026-07-13-timehours-userid-impersonation.md).
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

## 4. Proposed tool design (for when it is green-lit)

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

## 5. Cons to resolve before building

Each con from Section 2, turned into a prerequisite:

1. **Replace-semantics safety.** Confirm the read-first + mandatory `set`/`add` mode +
   previous-and-new total echo is sufficient, and that constraining a call to a single
   user+task+date is acceptable. If not, no tool.
2. **Consent granularity.** Decide whether on-behalf time writes warrant a distinct scope or a
   dedicated consent line rather than riding on `mcp:write`. See
   [SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md](SPEC_OAUTH_CONSENT_SCOPE_CHECKBOXES.md).
3. **Auditability.** Decide whether agent-written time entries need a source marker
   (`tblTaskTime` has no source column today; this is a backend change, not an MCP one).
4. **Volume / right surface.** ~~Get the customer's expected weekly entry volume.~~
   **Resolved 2026-08-04** (HS 11710): continuous daily flow, ~50 entries/day (~250/week)
   spread across the team on active projects; day-to-day operational logging (small tasks,
   handover work), no external time system to sync from. This is interactive agent-driven
   volume -- the tool is the right surface. The
   [Clockify connector](../../ITM.Connector/zz_Specifications/clockify-time-sync/clockify-time-sync.md)
   remains a separate concern for customers syncing from an external tracker.
