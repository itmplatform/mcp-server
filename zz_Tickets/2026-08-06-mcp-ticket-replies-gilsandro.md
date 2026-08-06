# Help Scout replies: Gilsandro 2026-08-04 follow-ups (11710 volume answer, 11761 project Seguimiento)

> **Status:** drafts, not sent. Both replies acknowledge requests whose implementation is
> pending a go decision; neither promises a date.
> Analysis: [SPEC_MCP_TIME_ENTRY_TOOLS.md](../zz_Specifications/SPEC_MCP_TIME_ENTRY_TOOLS.md)
> (revisit triggered, prerequisite 4 resolved) and
> [SPEC_MCP_PROJECT_PROGRESS_TOOLS.md](../zz_Specifications/SPEC_MCP_PROJECT_PROGRESS_TOOLS.md) (new).

---

## 1. Ticket 11710 - time entries: volume answered (~50/day continuous), priority requested

**Link:** https://secure.helpscout.net/conversation/3403398037/11710/

Context: our 2026-08-03 reply asked for the expected volume. He answered on 2026-08-04:
continuous daily flow, ~50 entries/day across the team, and asked to prioritize because his
own small/handover tasks make manual entry laborious. This fires the revisit trigger of the
on-hold time-entry spec and resolves its volume prerequisite.

```text
Estimado Gilsandro,

Muchas gracias por la información sobre el volumen y por el contexto adicional. Es exactamente lo que necesitábamos para dimensionar la solución.

Un flujo continuo de unos 50 registros diarios encaja bien con el diseño que tenemos preparado: una herramienta MCP para registrar horas trabajadas en una tarea, indicando usuario, fecha y horas, con confirmación del total anterior y el nuevo en cada operación para garantizar la trazabilidad. Con su respuesta hemos elevado la prioridad de esta funcionalidad y la hemos puesto en análisis final de diseño; le avisaremos en este mismo hilo en cuanto esté disponible en producción.

Dos consideraciones que conviene anticipar para su flujo:

1. El registro de horas de otro usuario (por ejemplo, al centralizar la imputación desde la PMO) requiere licencia de Company Admin o Full Access; cada usuario con acceso propio al MCP también podrá registrar sus propias horas.
2. Recuerde realizar la imputación antes de cerrar el proyecto, ya que los estados de cierre bloquean el registro de horas.

Quedamos a su disposición para cualquier duda.

Saludos cordiales.
```

---

## 2. Ticket 11761 - project-level Seguimiento via MCP (new request, 2026-08-04)

**Link:** https://secure.helpscout.net/conversation/3408302709/11761/

Context: new, well-researched request. He correctly identified that `get_project_progress`
only returns the computed curves and that no MCP tool writes the project-level Seguimiento
(evaluation semaphore, % completed, status description). Confirmed in code: the gap is real,
the v1 API has complete scoped CRUD, and the increment was already on our deferred list.
Reply confirms his analysis and accepts the request without committing to a date.

```text
Estimado Gilsandro,

Muchas gracias por su mensaje y por el análisis tan preciso, y nos alegra saber que la asignación de usuarios, los hitos y el esfuerzo estimado ya funcionan correctamente en su flujo.

Su diagnóstico es correcto: las herramientas actuales gestionan el seguimiento a nivel de tarea, y get_project_progress solo devuelve las curvas de avance calculadas; hoy no existe ninguna herramienta MCP que cree o actualice el Seguimiento a nivel de proyecto (evaluación, % completado y descripción del estado).

Hemos aceptado la solicitud y ya la hemos incorporado a nuestra hoja de ruta con una especificación concreta, análoga a las herramientas de tarea que usted menciona:

- create_project_progress: crear un seguimiento de proyecto con fecha, % completado, evaluación (los mismos valores del semáforo que devuelve get_reference_data con la entidad assessments) y descripción del estado.
- update_project_progress: actualizar un seguimiento existente.
- get_project_progress ampliado para devolver también el historial completo de seguimientos con su evaluación y descripción, no solo las curvas.

Con esto podrá automatizar el informe de estado semanal o mensual de sus proyectos directamente desde el asistente, como describe. Le avisaremos en este mismo hilo cuando esté disponible en producción; como siempre, será necesario reconectar el conector para ver las novedades del catálogo.

Muchas gracias de nuevo por la calidad de sus solicitudes; nos ayudan a priorizar con criterio.

Saludos cordiales.
```

---

## Internal notes (updated 2026-08-06 after implementation)

- Both features are IMPLEMENTED (v1.0.18): `log_time_entry`, `create_project_progress`,
  `update_project_progress`, and `includeEntries` on `get_project_progress`. When announcing
  the release in these threads, add two behavior notes discovered during implementation:
  (1) a project Seguimiento entry at 100% auto-closes the project (platform behavior), so
  hours must be logged before the final status report; (2) time entries store one total per
  user+task+date, and the tool's add/set modes plus previous/new total echo handle that.

## Internal notes

- The two replies are deliberately consistent about status: both features are accepted and
  specced, neither has a committed date. If Daniel green-lights the combined release (both
  ride the same new v1 request path in the MCP REST client), the follow-up announcements go
  in these same threads.
- 11710 point 1 (assignment) and point 3 (close project) were already answered on
  2026-08-03 and confirmed working by the customer in 11761's opening message.
- License check before sending reply 1: confirm Gilsandro's license allows on-behalf writes
  (Company Admin or Full Access). If he is a Full User/PM-type license, the on-behalf
  paragraph needs adjusting so it does not promise something his license blocks.
