# HS 11118 - Google Calendar integration: reply draft (2026-08-03)

**Link:** https://secure.helpscout.net/conversation/3364831387/11118/

Context: Gilsandro (Ucloud) asked in June for Google Calendar integration; on 06-30 he
clarified he wants Clockify-style behavior (ITM synced with the user's calendar, calendar
blocks associated to ITM tasks). The 07-03 assessment in
`ITM.Connector/zz_Specifications/Google calendar sync/worth-it-assessment.md` recommended a
one-way ICS feed and gated anything bigger on demand; priority was lowered. He pinged again
on 07-30: "¿tienen alguna novedad?".

What is genuinely new since June: the MCP write surface matured (task CRUD, hierarchy,
milestones, per-user estimates, and since v1.0.17 user assignment), so an AI agent connected
to both Google Calendar and ITM Platform can already run calendar-to-ITM and ITM-to-calendar
workflows today, with nothing to build or maintain on our side. The one missing piece for the
exact Clockify flow (calendar block -> worked hours on a task) is MCP time-entry logging,
which is the capability "en análisis" from the 11710 reply. This ticket is now the fourth
independent pull for time entries (11586, 11634, 11710, 11118).

```text
Estimado Gilsandro,

Gracias por retomar el tema. Desde su consulta de junio, la integración vía MCP ha madurado mucho y hoy existe un camino que su equipo puede probar de inmediato.

Los principales asistentes de IA (Gemini, Claude, ChatGPT) pueden conectarse a la vez a Google Calendar y a ITM Platform (conector MCP: https://api.itmplatform.com/v2/_/mcp/). Con ambos conectores activos en la misma conversación, un usuario puede pedir al asistente, por ejemplo:

"Mira mis tareas de ITM Platform de esta semana y crea bloques en mi Google Calendar para trabajarlas" (ITM -> Calendar).
"Crea en ITM Platform una tarea por cada reunión de proyecto que tengo mañana, asignada a mí" (Calendar -> ITM). Desde la actualización publicada hoy, el asistente también puede asignar usuarios a las tareas y estimar sus horas.

La pieza que falta para replicar exactamente el flujo de Clockify que nos describió (convertir un bloque de calendario en horas trabajadas imputadas a la tarea) es el registro de horas vía MCP, que está en análisis activo, como le comentamos en su otra consulta. Su respuesta sobre el volumen semanal de registros nos ayudará a dimensionarlo y priorizarlo.

Saludos cordiales.
```

Internal: if he bites, the connect rate of his team on this agent flow is exactly the demand
signal the worth-it assessment wanted before green-lighting anything OAuth-heavy; and his
volume answer feeds prerequisite #4 of SPEC_MCP_TIME_ENTRY_TOOLS.md.
