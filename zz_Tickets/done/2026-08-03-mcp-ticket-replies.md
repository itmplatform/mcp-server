# Help Scout replies: MCP task assignment release (v1.0.17)

> **When to send:** after the ITM.MCP-Prod pipeline finishes (deploy in progress 2026-08-03).
> All four replies reference capabilities that are only true once prod is live.
>
> Common theme: AI clients cache the MCP tool catalog at connection time, so every reply
> includes reconnect instructions. Without reconnecting, the new `TaskManagers`/`TaskMembers`
> fields will not appear and clients will keep silently dropping them.

---

## Note for Darshi (internal)

Hi Darshi, quick summary of today's release (v1.0.17), which closes the gap you documented
on 07-27 for HS 11666:

- `TaskManagers`/`TaskMembers` are now declared on `create_task`/`update_task`, so the MCP
  layer no longer strips them and the v2 task pipeline assigns the users (add-only, usernames
  validated server-side). After the write, the handler reads back
  `GET .../tasks/{id}/users`, verifies every requested username (and the manager flag on
  Waterfall), and returns a compact `team` array. A username in both fields is rejected
  up front; invalid usernames fail the whole call.
- Your corrected texts in effort.ts / changelog / effort spec were restored or annotated to
  point at `update_task` again, since the guidance is now true. Spec:
  `zz_Specifications/SPEC_MCP_TASK_ASSIGNMENT.md`.
- Also verified (no code change): closing a project via MCP is just `update_project` with the
  `IsCompleted: true` status from `projectstatuses`; closed statuses block time entry but not
  task writes.
- Tests: TDD units (477 green), new `tests/e2e/task-assignment.e2e.test.ts`, full local e2e
  green including the 49 KB catalog budget, plus scripted OAuth e2e against deployed stage.
  Prod deploy approved by Daniel today.

---

## 1. Ticket 11710 - Gilsandro (Ucloud): assignment, time entries, close project

**Link:** https://secure.helpscout.net/conversation/3403398037/11710/

Asks for: (1) assign users to tasks, (2) log worked hours, (3) close project automatically.
Status: only the auto-acknowledgment was sent. Reply covers 1 = shipped, 2 = under analysis
(with the volume question that decision needs), 3 = possible today with instructions.

```text
Estimado Gilsandro,

Muchas gracias por su mensaje y por el detalle de su caso de uso. Le respondemos punto por punto.

1. Asignar usuarios a las tareas: ya está disponible. Hoy hemos publicado una actualización del MCP (v1.0.17) que añade dos campos opcionales a create_task y update_task:

- TaskManagers: nombres de usuario separados por comas, asignados como responsables de la tarea.
- TaskMembers: nombres de usuario separados por comas, asignados como miembros del equipo.

El nombre de usuario es el que la persona utiliza para iniciar sesión en ITM Platform (normalmente su email; es el valor EmailAddress que devuelve search_users). La asignación solo añade usuarios, nunca elimina a nadie, y si algún nombre no es válido la llamada completa falla con un mensaje claro, sin escribir nada. La respuesta incluye el equipo resultante de la tarea para confirmación. Con esto, el flujo completo queda disponible: crear el proyecto, crear las tareas, asignar los usuarios y estimar las horas por usuario con update_task_effort, todo vía MCP.

Importante: los clientes de IA (ChatGPT, Claude, etc.) guardan en caché el catálogo de herramientas al conectar. Para ver los nuevos campos, elimine el conector de ITM Platform en su cliente, vuelva a añadirlo (URL: https://api.itmplatform.com/v2/_/mcp/), inicie sesión de nuevo y comience una conversación nueva.

2. Registro de horas trabajadas (time entries): lo estamos analizando activamente. Para dimensionar bien la solución nos ayudaría conocer su volumen aproximado: ¿cuántos registros de horas semanales estiman, y sería una carga puntual (por ejemplo, migración de histórico) o un flujo continuo del día a día?

3. Cerrar el proyecto automáticamente: ya es posible hoy con las herramientas actuales. El cierre en ITM Platform es un cambio de estado: pida a su asistente que consulte get_reference_data con la entidad projectstatuses, identifique el estado con IsCompleted = true (por ejemplo "Cerrado") y aplique update_project con ese StatusId. Dos consideraciones: realice el cierre después de completar la imputación de horas, porque los estados de cierre bloquean el registro de horas; y el cambio es reversible aplicando de nuevo un estado abierto.

Quedamos a su disposición para cualquier duda.

Saludos cordiales.
```

---

## 2. Ticket 11715 - Ronald Gomez (Teams4Soft, via Luis Nieto): ChatGPT failures

**Link:** https://secure.helpscout.net/conversation/3404221417/11715/

Reported: could not create subtasks, assign resources, or set estimated hours from ChatGPT.
His screenshots show ChatGPT working with a stale, reduced tool catalog (no effort tools even
though they were in prod since 07-23). Reply = refresh the connector + all three things exist.

```text
Estimado Ronald,

Muchas gracias por su mensaje y por las capturas de pantalla, que nos permitieron identificar la causa exacta.

La lista de herramientas que ChatGPT le mostró estaba desactualizada. Al conectar un servidor MCP, ChatGPT guarda en caché el catálogo de herramientas y no siempre lo refresca, por lo que las funciones publicadas después de la conexión no aparecen. Las tres capacidades que usted intentó usar están disponibles:

1. Subtareas: create_task y update_task aceptan el parámetro ParentId para crear jerarquías con tareas resumen e hitos. Tenga en cuenta que la jerarquía solo aplica a proyectos con metodología en cascada (Gantt), no Kanban, y que la tarea padre no debe tener recursos asignados ni dependencias.

2. Asignación de recursos: disponible desde hoy (v1.0.17). Los campos TaskManagers y TaskMembers de create_task y update_task asignan usuarios a la tarea por su nombre de usuario (el email con el que inician sesión en ITM Platform). La asignación solo añade usuarios, nunca elimina.

3. Horas estimadas por usuario: las herramientas get_task_effort y update_task_effort están en producción desde el 23 de julio. Requieren que el usuario esté asignado a la tarea, lo cual ahora también puede hacerse vía MCP (punto 2).

Para que ChatGPT vea el catálogo actualizado:

1. En ChatGPT, abra Configuración > Conectores.
2. Elimine (desconecte) el conector de ITM Platform.
3. Vuelva a añadirlo con la misma URL: https://api.itmplatform.com/v2/_/mcp/ y complete el inicio de sesión.
4. Inicie una conversación nueva: las conversaciones antiguas conservan la lista anterior de herramientas.

Con el catálogo actualizado podrá crear el proyecto con sus tareas y subtareas, asignar los recursos y estimar las horas por usuario, todo desde ChatGPT.

Quedamos a su disposición para cualquier duda.

Saludos cordiales.
```

---

## 3. Ticket 11666 - Gilsandro (Ucloud): TaskMembers silently not assigning

**Link:** https://secure.helpscout.net/conversation/3396756717/11666/

His bug report was exactly right: update_task returned 200 but assigned nobody. Root cause:
the fields were not declared in the MCP tool schema, so the MCP layer silently dropped them
before reaching our API (his format e.humel@ucloudglobal.com was correct all along).
Reply = confirmed, fixed today, plus his budget-write request = under analysis.

```text
Estimado Gilsandro,

Muchas gracias por el informe tan detallado; los pasos de reproducción nos permitieron confirmar el problema exactamente como usted lo describió.

Solicitud 1 (TaskMembers/TaskManagers): su diagnóstico era correcto. Esos campos existían en nuestra API pero no estaban declarados en el esquema de las herramientas MCP, y la capa MCP descarta silenciosamente los campos no declarados: por eso la llamada respondía 200 sin asignar a nadie. El formato que usted utilizó (e.humel@ucloudglobal.com) era el correcto.

Hoy hemos publicado la versión v1.0.17, que declara TaskManagers y TaskMembers en create_task y update_task. Además:

- La asignación solo añade usuarios (nunca elimina a nadie del equipo).
- Un nombre de usuario inválido hace fallar la llamada completa con un mensaje claro, en lugar de ejecutarse en silencio.
- La respuesta incluye el equipo resultante de la tarea (usuario, nombre, indicador de responsable), verificado contra lo solicitado, para que una asignación silenciosamente fallida ya no pueda repetirse.

Con esto el flujo que ustedes necesitan queda completo: update_task con TaskMembers="e.humel@ucloudglobal.com" y a continuación update_task_effort para las horas estimadas.

Importante: su cliente de IA guarda en caché el catálogo de herramientas. Para ver los nuevos campos, elimine el conector de ITM Platform, vuelva a añadirlo (URL: https://api.itmplatform.com/v2/_/mcp/), inicie sesión y comience una conversación nueva.

Solicitud 2 (escritura del presupuesto de horas del proyecto: Equipo interno, Equipo externo, Presupuesto de compras): lo estamos analizando. El dato es consultable hoy vía get_project_budget y estamos evaluando la herramienta de escritura equivalente; le informaremos en cuanto tengamos novedades.

Muchas gracias de nuevo por la calidad del reporte.

Saludos cordiales.
```

---

## 4. Ticket 11586 - Gilsandro (Ucloud): four functional areas (never answered)

**Link:** https://secure.helpscout.net/conversation/3386229068/11586/

From 2026-07-14; no outbound reply was ever sent. Several requests have shipped since.
Reply = point-by-point status of all four areas.

```text
Estimado Gilsandro,

Antes de nada, disculpe la demora en responder a este hilo. Varias de las funcionalidades que solicitó se han ido publicando en las últimas semanas, así que le resumimos el estado de cada punto.

1. Gestión de horas:

- Horas estimadas/planificadas: disponible desde el 23 de julio (v1.0.15). update_task_effort define las horas estimadas por usuario asignado a la tarea, y opcionalmente el total estimado de la tarea. get_task_effort consulta el desglose completo.
- Detalle de horas por usuario y tarea: get_task_effort devuelve, por cada usuario asignado, las horas estimadas, las aceptadas y las imputadas, junto con el desglose por categoría profesional.
- Registro de horas trabajadas (imputación): lo estamos analizando activamente; le informaremos en cuanto tengamos una decisión.

2. Asignación de usuarios:

- Asignar usuarios a tareas: disponible desde hoy (v1.0.17). create_task y update_task aceptan TaskManagers y TaskMembers (nombres de usuario separados por comas; el nombre de usuario es el email de inicio de sesión). La asignación solo añade usuarios y la respuesta confirma el equipo resultante.
- Gestión de permisos/accesos: lo estamos considerando para futuras versiones.

3. Gestión de cronograma:

- Hitos: disponibles desde la v1.0.11. create_task con KindId = 1 crea un hito en su EndDate, y update_task permite moverlo (enviando StartDate y EndDate con la misma fecha). KindId = 2 crea tareas resumen y ParentId construye la jerarquía del Gantt.
- Dependencias entre tareas (predecesoras/sucesoras): en análisis; es una de las capacidades más solicitadas y la tenemos priorizada en la hoja de ruta.
- Visualización/reorganización del cronograma completo: en evaluación; hoy list_project_tasks devuelve todas las tareas con su jerarquía (ParentTask), fechas y estado, lo que permite a un asistente reconstruir el cronograma.

4. Módulo de Seguimiento: correcto, las herramientas de progreso gestionan porcentaje, evaluación y notas. Las horas estimadas se gestionan con las herramientas de esfuerzo del punto 1, y las horas trabajadas siguen el análisis mencionado en ese mismo punto.

Recordatorio importante: los clientes de IA guardan en caché el catálogo de herramientas MCP. Para ver las novedades, elimine el conector de ITM Platform, vuelva a añadirlo (URL: https://api.itmplatform.com/v2/_/mcp/), inicie sesión y comience una conversación nueva.

Quedamos a su disposición.

Saludos cordiales.
```

---

## Internal notes

- 11710, 11666 and 11586 are all Gilsandro. The three replies are consistent: assignment
  shipped (v1.0.17), worked-hours time entries "en análisis" (the on-hold decision in
  SPEC_MCP_TIME_ENTRY_TOOLS.md; the volume question in the 11710 reply is prerequisite #4
  of that spec), budget write "en análisis" (backlog P3 #20), dependencies "en análisis"
  (backlog P4), permissions "en evaluación" (not on the backlog).
- 11715: reply goes to Ronald (customer on the thread is Luis Nieto, who forwarded it).
- After sending, consider closing 11666 (bug fixed) and 11715 (resolved); keep 11710 open
  pending the volume answer, and 11586 open or closed at Karen's discretion.
