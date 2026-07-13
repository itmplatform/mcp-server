# Help Scout 11535 -- MCP time tracking, follow-up, and reporting

**Source:** [Help Scout conversation 3382659721 / 11535](https://secure.helpscout.net/conversation/3382659721/11535/)
**Requester:** Gilsandro Cezar, UCloud Global PMO
**Date:** 2026-07-13
**Status:** Product and technical recommendation
**Explicitly out of scope:** the reported `query_datamart` 401 error

```
Hola,

Utilizamos la integración MCP de ITM Platform con Claude para consultas y algunas operaciones de escritura (creación/actualización de tareas e issues). Identificamos limitaciones que impactan nuestro flujo de trabajo de PMO:

1. **Registro de horas consumidas (time entries / imputación de horas):** no existe ninguna herramienta en el MCP para registrar horas trabajadas en una tarea. Las tools disponibles (`create_task`, `update_task`) no cuentan con un campo de horas.
2. **Módulo de Seguimiento:** no podemos crear ni consultar entradas de seguimiento a través del MCP.
3. **Acceso al módulo de Informes/BI:** este módulo permanece completamente fuera del alcance del MCP.
4. **`query_datamart`:** devuelve error 401 de forma consistente, lo que sugiere que requiere un scope de autenticación separado del resto del MCP.

**Solicitud:** Nos gustaría saber si existen planes para exponer estas funcionalidades (especialmente el registro de horas) a través del MCP, y si existe algún workaround oficial en este momento.
```

See the [parent README.md](../../README.md) for access, credentials, and other repos.

---

## Where each request is handled

The customer filed one ticket, but the work lands in four repos. **This document only covers the MCP part.** Everything else is a reference.

| Customer request | Verdict | Where it is tracked |
|---|---|---|
| **2. Seguimiento (progress)** | **Build it in MCP.** No blockers. Ship this first | **This document, section "Progress tools"** |
| **3. Reports / BI** | Already solved in MCP (`query_datamart`, `aggregate_portfolio`). The gap is data, not tools | Data gap: [ITM.DataMart/zz_Specifications/time-reports-datamart-research.md](../../ITM.DataMart/zz_Specifications/time-reports-datamart-research.md) |
| **1. Time entries** | **Not an MCP feature.** What they want is their Clockify time in ITM. That is a connector | [ITM.Connector/zz_Specifications/clockify-time-sync/clockify-time-sync.md](../../ITM.Connector/zz_Specifications/clockify-time-sync/clockify-time-sync.md) |
| (security finding from 1) | Fixed locally: caller authentication is mandatory and only Company Admin/Full Access may write for another user | [Completed ITM.Web timehours authorization ticket](../../ITM.Web/zz_Tickets/done/2026-07-13-timehours-userid-impersonation.md) |

The single most useful reframing: **the customer did not ask for a migration, and they did not really ask for an MCP tool.** They asked for their tracked time to be in ITM Platform. MCP was just the surface they happened to be using.

---

## 1. Progress / Seguimiento tools (the MCP deliverable)

This is the part of the ticket with no dependencies. It should ship first and can ship alone.

"Seguimiento" is a separate domain from time entry. `update_task.PercentComplete` is intentionally rejected today because progress is stored through the follow-up/progress APIs and has side effects: task status transitions, parent rollups, automatic project progress, events, and notifications. Setting a percentage directly on the task would bypass all of them.

### Recommended tool surface

```text
list_task_progress(projectId, taskId, limit?, skip?)
create_task_progress(projectId, taskId, reportDate, percentage, assessmentId, shortDescription, description?)
update_task_progress(projectId, taskId, progressId, ...changed fields)
get_project_progress(projectId)
```

Optional later parity:

```text
create_project_progress(...)
list_activity_progress(serviceId, activityId, ...)
create_activity_progress(...)
```

### Implementation notes

- Reuse the existing v2 task progress `POST` and `PATCH` routes (`ITM.Tasks/Controllers/TaskFollowUpController.cs`). The write logic already exists.
- Add a paginated v2 task-progress `GET`. Do not fall back permanently to the v1 controller.
- Reuse the existing v2 project progress-report graph/history read (`ITM.Tasks/Controllers/ProjectFollowUpController.cs`).
- Add service/activity parity as a separate increment. The routes and permission model differ.
- Discover valid assessment values through `get_reference_data`. `assessmentId` is mandatory for a main task follow-up in current validation.
- Confirm writes by reading back the created progress record, as the other MCP write tools do.
- Respect PM scoping: a Project Manager must not write progress outside their managed projects.

⚠️ Related: [2026-07-07-cross-tenant-project-progress-leak.md](../../ITM.Web/zz_Tickets/2026-07-07-cross-tenant-project-progress-leak.md) is an open cross-tenant authorization leak in the **legacy v1** project progress API, found with this same customer. The MCP tools should use the **v2** routes, which are not implicated, but confirm that before wiring anything up.

High value, moderate effort: most domain logic already exists, and `update_task` already points users toward it.

### Acceptance criteria

- Progress creates and updates preserve the existing side effects: status transitions, parent and project rollups, events, notifications.
- PM scope prevents writes outside managed projects.
- Created and updated progress is read back and returned.
- Assessment references are discoverable and validated.

---

## 2. Reports / BI

**The tools already exist.** MCP has `query_datamart` (validated DataMart queries) and `aggregate_portfolio` (group and summarize portfolio data). An AI client can already produce custom reports, summaries, and analyses from portfolio data. There is nothing to build in MCP here.

What is genuinely missing is **daily time-entry detail rows in DataMart**. Today DataMart carries aggregate effort fields on tasks (`actualEffortTimeEntryInMinutes`, `acceptedEffortInMinutes`, `estimatedEffortInMinutes`) but not the per-user, per-date, per-task rows needed to answer "how many hours did each person log last week?"

That work belongs to DataMart and is already researched in depth in
[time-reports-datamart-research.md](../../ITM.DataMart/zz_Specifications/time-reports-datamart-research.md),
which covers the document-size problem (some component documents already exceed 2 MB against MongoDB's 16 MB cap), the separate-collection design, the sync strategy, and the v2 `TimeReports/Search` source API it needs. Do not duplicate that analysis here.

Once that data is in DataMart, `query_datamart` covers the reporting use cases with **no new MCP tools**.

### What not to build in MCP

- No `query_time_entries` or `aggregate_time_entries` tools. `query_datamart` already does this.
- No generic `run_report(reportId)` tool. The legacy report designer is a UI concern.
- No tools for creating or editing legacy report definitions.

---

## 3. Time entries: deferred, and not an MCP feature

### Why not

Two independent reasons, either of which is sufficient.

**It is the wrong surface for the customer's actual need.** They track time in Clockify and want it in ITM. That is a recurring bulk sync of many users' entries, which is a connector's job: scheduled, deterministic, server-side, reconcilable. An MCP tool is a model-driven, interactive, per-call surface. Using it as an ETL engine would be slow, expensive, and impossible to reconcile. Full design in the [Clockify connector spec](../../ITM.Connector/zz_Specifications/clockify-time-sync/clockify-time-sync.md).

**The former API safety blocker is resolved locally.** `POST /{company}/timehours` now validates the caller first; self-service remains available to every license, while only Company Admin or Full Access callers may set another active same-account user's `UserId`. Target/account/task/entity, assignment, and editability checks apply before writes. See the [completed ITM.Web ticket](../../ITM.Web/zz_Tickets/done/2026-07-13-timehours-userid-impersonation.md). Deployment is required before a deployed consumer relies on the contract.

The deferral remains a **product/surface decision**, not a security dependency: the customer's Clockify synchronization belongs in ITM.Connector, and an MCP time-entry tool may still be unnecessary.

### If and when MCP time-entry tools are built

If product later chooses to build MCP time-entry tools, use these constraints:

**The user is always the authenticated caller. No `userId` parameter.** Impersonation is not an MCP use case. The agreed platform rule is that only a Company Admin or Full Access user may write on behalf of another user, and that exists to serve connectors, not AI clients.

**Time entries have three distinct concepts,** and a naive "add an hours field" would get this wrong:

1. **Actual effort, direct hours** (`intTimeEntryType = 2`). The common type. A total for user + task + date, stored in `tblTaskTime`, no clock times. This is what `POST /{company}/timehours` writes, always.
2. **Actual effort, time range** (`intTimeEntryType = 1`). Explicit start and end clock times, used by the legacy time-table UI. **No public write API.** Types 1 and 2 are mutually exclusive for a given user + task + date: creating one deletes the other.
3. **Accepted effort.** Not a time entry at all. A derived aggregate on `tblTaskUser`, auto-recalculated as the SUM of `tblTaskTime` rows after every save when `IsAutomaticActualEffortAccepted = 1` (the default). **No MCP tool should ever write it.**

**The write is a replace, not an append.** The effective key is user + task + date, and posting 90 minutes when 60 already exist yields 90, not 150. Any tool description must say "sets the total reported time for this user on this task for this date," or the model will get it wrong. If additive behavior is wanted, the tool must read first and add.

Licensing is not a constraint: Team Member licenses are free, so there is no commercial reason to withhold time logging. The MCP-level Team Member block is a separate product decision (`src/auth/license-resolver.ts`).

---

## Delivery order

| # | Work | Repo | Blocked by |
|---|---|---|---|
| 1 | **MCP progress tools** | ITM.MCP | Nothing. **Start here** |
| 2 | Fix the `timehours` authorization defect | ITM.Web | **Implemented locally; deploy before consumers** |
| 3 | Clockify connector | ITM.Connector | Build-ready; deployed item 2 required before enablement |
| 4 | Time-entry detail in DataMart | ITM.DataMart | Nothing (but shares a v2 source API with 3) |
| 5 | MCP time-entry tools | ITM.MCP | **Deferred on product merit**, may never be needed |

Items 1, 2 and 4 can run in parallel. Only the MCP progress tools are needed to give this customer something real in the near term.

---

## Open questions

### For MCP (needed to scope item 1)

1. For "Seguimiento," do they need task progress, project progress, service activity progress, or all three?

### For the Clockify connector

Tracked in the [connector spec](../../ITM.Connector/zz_Specifications/clockify-time-sync/clockify-time-sync.md#10-open-questions-for-ucloud). The two that matter most, because they change the design rather than just the scope:

- Are daily totals per task sufficient, or do they need Clockify's start and end clock times preserved? (ITM's writable time entry has no clock times.)
- Will users log time in **both** systems for the same task and day, or is Clockify the single source for synced projects? (There is no way to merge safely: `tblTaskTime` has no external-source column.)

---

## Suggested customer response (Spanish)

> Gracias por el detalle. Confirmamos que actualmente MCP no expone ni las imputaciones de horas ni las entradas de Seguimiento.
>
> **Seguimiento:** vamos a incorporar herramientas de MCP para el progreso de tareas y proyectos, respetando los permisos y la identidad del usuario conectado. Es la parte que podemos abordar antes, y no depende de nada más.
>
> **Registro de horas:** entendemos que el objetivo real es que las horas que registran en Clockify lleguen a ITM Platform. Para eso, el camino correcto no es una herramienta de MCP sino un **conector**, que puede ejecutarse de forma programada o mediante webhooks de Clockify. Ya tenemos un precedente equivalente con el conector de Jira.
>
> Antes de construirlo necesitamos confirmar dos puntos con ustedes. El primero: ITM Platform almacena **un registro de horas por usuario, tarea y día** (un total diario), no intervalos de hora de inicio y fin como Clockify. Las entradas de Clockify se consolidarían en totales diarios por tarea, y queremos confirmar que eso les sirve. El segundo: si sus usuarios imputarán horas en ambos sistemas o si Clockify será la única fuente para los proyectos sincronizados, ya que eso cambia el diseño de la sincronización.
>
> **BI:** MCP ya permite consultas analíticas mediante `query_datamart` y `aggregate_portfolio`, así que ese módulo no está fuera de alcance. Lo que falta es incluir el detalle diario de horas en el DataMart, que es lo que vamos a agregar.

---

## TODO checklist

Investigation (done):

- [x] Read the full Help Scout conversation and verify it has no relevant attachments.
- [x] Exclude the 401 issue from this document.
- [x] Trace current MCP tools and license behavior.
- [x] Trace time entry, follow-up, reports, and DataMart prior art.
- [x] Confirm the existing REST time-entry endpoint and its payload.
- [x] Document the three time-entry concepts (direct hours, time range, accepted effort).
- [x] Verify how the time-entry API resolves user identity. **Found an authorization defect.**
- [x] Check whether `UserId` is documented in APIDocs (**no**) and whether the web UI sends it (**no**). The Jira connector does, which is why the field exists.
- [x] Check the Clockify API model against ITM's (start/end vs daily totals, ISO-8601 durations, webhooks).
- [x] Confirm the extension framework can host the connector, and that a single global extension for all tenants is feasible.
- [x] Confirm the "Company Admin or Full Access" authorization rule is implementable and compatible with how extensions authenticate.
- [x] Split the work into per-repo tickets and specs.

Next:

- [x] Engineering (ITM.MCP): progress tools. Implemented locally on 2026-07-13 (4 MCP tools, v2 GET endpoints in ITM.Tasks, assessments reference endpoint + gateway entry); all unit and E2E tests green. See [SPEC_MCP_PROGRESS_TOOLS.md](done/SPEC_MCP_PROGRESS_TOOLS.md). Pending deployment via pipeline.
- [x] Engineering (ITM.Web): implement and locally verify the `timehours` authorization fix; deployment remains a release step.
- [ ] Support/account owner: ask UCloud the open questions above.
- [ ] Engineering (ITM.Connector): Clockify connector; the API contract is ready, and the ITM.Web fix must be deployed before enablement.
- [ ] Engineering (ITM.DataMart): time-entry detail collection.
- [ ] Confirm whether the Jira worklog sync is actually live in production (its loops are gated by `"condition": "1 == 0"`).
