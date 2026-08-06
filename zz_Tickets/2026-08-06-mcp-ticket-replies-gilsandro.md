# Help Scout replies: Gilsandro (11710 time entries, 11761 project Seguimiento)

> **Status:** READY TO SEND. Both features are implemented, deployed to production
> 2026-08-06 (ITM.MCP v1.0.18, prod pipeline run 7434) and verified there via scripted
> OAuth e2e (10/10 checks, fixtures cleaned). Replies below announce the release with the
> "we were already working on it and it is now in production" framing Daniel asked for.
> Specs: [done/SPEC_MCP_TIME_ENTRY_TOOLS.md](../zz_Specifications/done/SPEC_MCP_TIME_ENTRY_TOOLS.md)
> and [done/SPEC_MCP_PROJECT_PROGRESS_TOOLS.md](../zz_Specifications/done/SPEC_MCP_PROJECT_PROGRESS_TOOLS.md).

---

## 1. Ticket 11710 - time entries: announce log_time_entry in production

**Link:** https://secure.helpscout.net/conversation/3403398037/11710/

Context: our 2026-08-03 reply answered assignment (shipped) and close-project, and asked
for volume on time entries. Gilsandro replied 2026-08-04 (continuous flow, ~50 entries/day,
asked to prioritize) and again 2026-08-06 at 12:29 ("Podrían revisar también el tema de la
imputación automática de horas, por favor?"). "Imputación de horas" = logging worked
hours, exactly what v1.0.18 ships. The reply answers all three messages.

```text
Estimado Gilsandro,

Muchas gracias por la información sobre el volumen y por su paciencia. Tenemos buenas noticias: ya estábamos trabajando en esta funcionalidad cuando recibimos su mensaje, y hoy mismo ha quedado publicada en producción.

El MCP incluye ahora la herramienta log_time_entry, que registra las horas efectivamente trabajadas en una tarea, indicando usuario, fecha y horas. Algunos detalles de su funcionamiento, pensados precisamente para un flujo continuo como el suyo (unos 50 registros diarios):

- Cada registro indica la tarea, la fecha y las horas trabajadas (por ejemplo 2 horas 30 minutos).
- El modo es explícito: "set" fija el total del día y "add" suma horas al total existente. La plataforma guarda un único total por usuario, tarea y día, y la respuesta de cada operación confirma el total anterior y el nuevo, para trazabilidad completa.
- Cada usuario con acceso propio al MCP registra sus propias horas. Registrar horas de otro usuario (por ejemplo, centralizando la imputación desde la PMO) requiere licencia de Company Admin o Full Access.

Dos consideraciones prácticas para su flujo de creación y cierre automatizado de proyectos:

1. Realice la imputación antes de cerrar el proyecto: los estados de cierre bloquean el registro de horas.
2. El registro de horas requiere que el estado del proyecto lo permita. Un proyecto recién creado puede conservar un estado inicial que no lo permite; basta con moverlo a un estado de ejecución antes de imputar.

Para ver la nueva herramienta, recuerde eliminar y volver a añadir el conector de ITM Platform en su cliente de IA (URL: https://api.itmplatform.com/v2/_/mcp/), iniciar sesión de nuevo y comenzar una conversación nueva, ya que los clientes guardan el catálogo en caché.

Con esto, el ciclo completo que nos describió en julio (crear el proyecto, crear y asignar las tareas, estimar horas, imputar las horas reales y cerrar el proyecto) queda disponible de punta a punta vía MCP.

Quedamos a su disposición para cualquier duda.

Saludos cordiales.
```

---

## 2. Ticket 11761 - project-level Seguimiento: announce the tools in production

**Link:** https://secure.helpscout.net/conversation/3408302709/11761/

Context: his 2026-08-04 request is precise and correct (project-level Seguimiento tab is
not covered by get_project_progress curves). No reply has been sent yet on this thread.
The reply confirms his analysis and announces the tools, already live.

```text
Estimado Gilsandro,

Muchas gracias por su mensaje y por el análisis tan preciso, y nos alegra saber que la asignación de usuarios, los hitos y el esfuerzo estimado ya funcionan correctamente en su flujo.

Su diagnóstico es correcto: hasta ahora ninguna herramienta MCP gestionaba el Seguimiento a nivel de proyecto. Le confirmamos que ya estábamos trabajando en esta funcionalidad, y hoy mismo ha quedado publicada en producción:

- create_project_progress: crea un seguimiento de proyecto con fecha, % completado, evaluación (los mismos valores del semáforo que devuelve get_reference_data con la entidad assessments: Bueno / No crítico / Crítico) y descripción del estado.
- update_project_progress: actualiza un seguimiento existente; los campos que no envíe se conservan.
- get_project_progress ahora acepta includeEntries para devolver también el historial completo de seguimientos con su evaluación y descripción, además de las curvas de avance.

Una advertencia importante: al registrar un seguimiento con el 100% completado, la plataforma cierra automáticamente el proyecto. Es el comportamiento estándar de ITM Platform, y conviene tenerlo en cuenta en sus automatizaciones: impute las horas antes del seguimiento final, porque el estado de cierre bloquea el registro de horas.

Para ver las nuevas herramientas, recuerde eliminar y volver a añadir el conector de ITM Platform en su cliente de IA (URL: https://api.itmplatform.com/v2/_/mcp/), iniciar sesión de nuevo y comenzar una conversación nueva.

Con esto podrá automatizar el informe de estado semanal o mensual de sus proyectos directamente desde el asistente, como describía en su mensaje.

Muchas gracias de nuevo por la calidad de sus solicitudes; nos ayudan a priorizar con criterio.

Saludos cordiales.
```

---

## Internal notes (final, 2026-08-06)

- v1.0.18 deployed to production 2026-08-06 (run 7434) after the ITM.Web/ITM.API release
  (runs 7430/7431) that fixes v1 token validation for OAuth sessions and the
  `GetIsTaskEditiableByDateAndTask` sproc (applied to the prod DB automatically by the
  pipeline sp-delta step). Prod OAuth e2e: 10/10, including 100% auto-close and the
  multi-row token fix (classic REST token survived an MCP session).
- On-behalf licensing is stated neutrally in reply 1 (Company Admin or Full Access
  required to log hours for another user); Gilsandro's own license was not verified, the
  phrasing is correct regardless.
- 11710 points 1 (assignment) and 3 (close project) were answered 2026-08-03 and
  confirmed working by the customer in 11761's opening message. Reply 1's closing line
  ties the end-to-end cycle together; the 100% auto-close route to closing is described
  in reply 2.
