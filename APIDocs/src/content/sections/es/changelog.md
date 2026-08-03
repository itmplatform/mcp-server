### v1.0.17

Asignación de usuarios: `create_task` y `update_task` ahora pueden asignar usuarios a las tareas.

**Herramientas ampliadas (2):**
- `create_task` / `update_task`: los nuevos campos opcionales `TaskManagers` y `TaskMembers` aceptan nombres de usuario separados por comas y asignan esos usuarios a la tarea en la misma llamada. Los proyectos en cascada distinguen entre responsables de tarea y miembros del equipo; los proyectos Kanban guardan a todos como miembros. La asignación solo añade: los usuarios indicados se agregan (o se actualiza su indicador de responsable) y nunca se elimina a nadie. Los usuarios que aún no pertenecen al equipo del proyecto se añaden automáticamente.
- Cuando se usan los campos de asignación, la respuesta incluye un arreglo compacto `team` (nombre de usuario, id, nombre visible, indicador de responsable) leído del endpoint de equipo de la tarea y verificado contra la solicitud.

**Notas:**
- Los nombres de usuario son los valores `EmailAddress` que devuelve `search_users`; cualquier nombre inválido hace fallar la solicitud completa sin escribir nada.
- Un usuario listado en ambos campos se rechaza de entrada (el backend lo guardaría silenciosamente como miembro).
- Esto completa el flujo de estimación de punta a punta: crear la tarea, asignar el equipo y definir las horas estimadas por usuario con `update_task_effort`.
- Quitar asignados de una tarea sigue sin estar disponible vía MCP (use la interfaz web).

### v1.0.16

Corrección de compatibilidad con los conectores personalizados de Claude. El servidor sigue exponiendo las 44 herramientas con los mismos esquemas y comportamiento, pero elimina texto duplicado de los metadatos serializados para que la respuesta completa de `tools/list` se mantenga por debajo de un presupuesto de compatibilidad de 49 KB.

**Fiabilidad:**
- Se añadió una comprobación E2E de regresión sobre el tamaño UTF-8 real de la respuesta `tools/list`.
- Se conservó la guía necesaria para escrituras seguras: metodología de tareas, progreso automático, IDs de referencia, asignaciones y preservación del esfuerzo.

### v1.0.15

Esfuerzo por usuario en tareas: consultar el desglose de esfuerzo y definir las horas estimadas por usuario asignado.

**Nuevas herramientas (2):**
- `get_task_effort`: el desglose de esfuerzo de una tarea por miembro del equipo (horas estimadas, aceptadas y de imputación, más la categoría de facturación) y por categoría profesional. La lista `teamMembers` sirve también como equipo de la tarea, así que responde a "¿quién está asignado a esta tarea?".
- `update_task_effort`: define el esfuerzo ESTIMADO (planificado) por usuario asignado, opcionalmente junto con una estimación total explícita de la tarea (si no se indica, el total se recalcula a partir de las estimaciones, como hace la interfaz web). Solo datos de planificación: nunca escribe horas trabajadas ni esfuerzo aceptado, y lee el estado actual primero para preservar exactamente el esfuerzo aceptado, los indicadores de aceptación automática, las categorías de facturación, los esfuerzos por categoría y los usuarios no incluidos.

**Notas:**
- El usuario debe estar ya asignado a la tarea. Crear asignaciones queda fuera del alcance de MCP: asigne al usuario en ITM Platform, o use el `PATCH` REST v2 de la tarea con nombres de usuario en `TaskMembers`/`TaskManagers`. Descubra los asignados con `get_task_effort` o `search_users`.
- Se rechazan hitos y tareas resumen: el esfuerzo pertenece a las tareas normales.
- El registro de horas trabajadas sigue fuera del alcance de MCP; use el endpoint REST documentado `timehours` para imputaciones programáticas.

### v1.0.14

Descubrimiento de campos personalizados: definiciones, opciones de lista y contexto de sesión por cuenta.

**Nuevas herramientas (2):**
- `get_custom_fields`: las definiciones de campos personalizados de la cuenta (nombre, tipo, obligatorio, BaseId) para proyectos, tareas, riesgos, incidencias, servicios, actividades, compras o ingresos. Las definiciones son por idioma (1=inglés, 2=español, 3=portugués); la herramienta usa por defecto el idioma del usuario.
- `get_custom_field_options`: las opciones seleccionables de un campo personalizado de lista (RYGList, DropDownList, List), por BaseId.

**Contexto de sesión:**
- Cuando la cuenta define campos personalizados, el servidor ahora enumera las claves de `customFields` realmente en uso en DataMart (con recuento de componentes) en las instrucciones del initialize de MCP y al final de la descripción de `query_datamart`. Los agentes pueden responder preguntas sobre campos personalizados sin ningún paso previo de descubrimiento, con avisos para claves que contienen puntos (no direccionables con notación de punto) y pistas sobre variantes de clave por idioma en cuentas multilingües.

**Notas:**
- Los valores de campos personalizados ya se podían consultar con `query_datamart` (objeto `customFields` en cada documento de componente, indexado por el nombre visible del campo, sensible a mayúsculas y acentos); esta versión los hace descubribles.

### v1.0.13

CRUD básico P1: lecturas de entidad individual, búsqueda de tareas en toda la cuenta y la superficie de escritura de riesgos, incidencias, servicios y actividades.

**Nuevas herramientas (10):**
- 4 de lectura: `get_task`, `get_risk` y `get_issue` recuperan el detalle completo de una entidad desde REST v2 (fuente de verdad, sin retraso de DataMart); `search_tasks` busca tareas en todos los proyectos por nombre, estado, persona asignada, tipo de elemento o rango de fechas, devolviendo cada tarea con su proyecto.
- 6 de escritura: `update_risk` (incluidos los planes de mitigación y contingencia), `update_issue` (incluida la resolución final), `create_service`, `update_service`, `create_activity` y `update_activity`. Todas siguen el patrón de escritura estándar: normalización de IDs de referencia, relectura desde REST v2 y verificación en origen.

**Datos de referencia:**
- Nueva entidad `servicetypes` en get_reference_data para descubrir los tipos de servicio que exige create_service.

**Notas:**
- Las actividades de un servicio forman una lista plana: las herramientas de actividades rechazan `KindId` y `ParentId` (los hitos, tareas resumen y jerarquía solo existen en tareas de proyecto).
- `update_risk` acepta `ContingencyPlan` y lo asigna al nombre de campo del backend (`ContigencyPlan`).

### v1.0.12

Correcciones del contrato de creación de riesgos y de la verificación de tareas resumen.

**Validación de escritura:**
- `create_risk` publica ahora `TypeId`, `StatusId`, `ImpactId`, `ProbabilityId` y `LevelId` como entradas MCP obligatorias (la ruta v2 de creación de riesgos siempre las exigió) y rechaza los campos ausentes en el cliente con una referencia a la entidad de datos correspondiente, en lugar de reenviar un 400 de REST.
- `create_task` y `update_task` rechazan `TypeId` en tareas resumen (KindId 2). El backend lo ignora y omite el tipo en la relectura, lo que antes producía un falso error de verificación de escritura tras una creación correcta.

**Datos de referencia:**
- Nueva entidad `risklevels` en get_reference_data para descubrir los valores de `LevelId` que exige create_risk. `LevelId` acepta valores Id localizados y los normaliza al BaseId que requiere REST v2, igual que el resto de campos de referencia de riesgos. Requiere la ruta `v2/{company}/risklevels` del API Gateway publicada junto con esta versión.

**Documentación:**
- `create_task` y `update_task` documentan el efecto secundario de progreso automático: los estados con AutomaticProgress (como Completada) crean una entrada de progreso del 100%, y percentComplete sigue la entrada más reciente por ReportDate.

### v1.0.11

Creación de proyectos, jerarquía de tareas e hitos.

**Nuevas herramientas (1):**
- `create_project`: crea un proyecto Waterfall o Kanban. El proyecto se crea con el estado predeterminado de la cuenta (use update_project para cambiarlo) y el usuario creador se convierte en el jefe de proyecto. Cuando la variable opcional `ITM_UI_URL` está configurada, la respuesta incluye un enlace `uiUrl` para abrir el proyecto en la interfaz de ITM Platform.

**Herramientas ampliadas (2):**
- `create_task` y `update_task` aceptan `KindId` (1=Hito, 2=Tarea resumen, 3=Tarea) y `ParentId` para construir la jerarquía del Gantt en proyectos Waterfall. Una tarea normal usada como padre se convierte automáticamente en tarea resumen. Los hitos se sitúan en su fecha de fin: las herramientas validan las reglas de fechas en el cliente para que un hito nunca se convierta silenciosamente en una tarea normal.

**Documentación:**
- El tipo de elemento (`KindId`) se distingue ahora claramente del tipo de tarea (`TypeId`) en las descripciones de las herramientas

### v1.0.10

Herramientas de cambio de estado masivo.

**Nuevas herramientas (2):**
- `bulk_update_task_status`: aplica un estado a hasta 100 tareas de un proyecto en una sola llamada. Admite IDs de estado Waterfall, IDs de columna Kanban y resolución de nombres de estado en el servidor.
- `bulk_update_activity_status`: aplica un estado a hasta 100 actividades de un servicio en una sola llamada. Los nombres de estado se resuelven contra la lista de estados de actividad.

**Datos de referencia:**
- Nueva entidad `activitystatuses` en get_reference_data para descubrir los estados válidos de actividades de servicio (son distintos de los estados de tarea)

**Robustez del cliente:**
- Las peticiones de estado masivo usan un tiempo límite de 90 segundos mediante AbortController

### v1.0.9

Correcciones del contrato de creación de tareas e incidencias.

**Validación de escritura:**
- `create_task` comprueba la metodología del proyecto antes de escribir. Las tareas Waterfall requieren `StatusId`, `StartDate` y `EndDate`; las tareas Kanban siguen utilizando los valores predeterminados del tablero.
- `create_issue` publica ahora `TypeId` y `StatusId` como entradas MCP obligatorias.
- Las respuestas de validación REST conservan el `StatusMessage` del servicio, con texto alternativo limitado, en vez de devolver solo un estado HTTP genérico.

### v1.0.8

Soporte de seguimiento (avance) de tareas y proyectos.

**Nuevas herramientas (4):**
- 2 de lectura: list_task_progress (historial de seguimiento de una tarea), get_project_progress (curvas de avance esperado, línea base y real)
- 2 de escritura: create_task_progress, update_task_progress. Crear seguimiento preserva todos los efectos de la plataforma: transición de estado al llegar al 100%, propagación a tareas resumen y avance automático del proyecto

**Datos de referencia:**
- Nueva entidad `assessments` en get_reference_data para descubrir las valoraciones que requiere create_task_progress

**Documentación:**
- El catálogo de herramientas ahora también documenta list_service_activities, get_service_purchases y get_service_revenues, publicadas en una versión anterior del servidor

### v1.0.0

Lanzamiento inicial del servidor MCP de ITM Platform.

**Herramientas (20):**
- 15 herramientas de lectura: search_projects, get_project, search_services, get_service, list_project_tasks, get_project_budget, get_project_purchases, get_project_revenues, get_project_risks, get_project_issues, aggregate_portfolio, query_datamart, search_users, get_user, get_reference_data
- 5 herramientas de escritura: create_task, update_task, create_risk, create_issue, update_project

**Recursos (6):**
- 5 recursos de esquema DataMart (component, tasks, purchases, risks, issues)
- 1 plantilla de recurso de calendario

**Prompts (4):**
- project_status, portfolio_overview, team_workload, risk_analysis

**Autenticación:**
- Clave API (modo stdio)
- OAuth 2.1 con PKCE (modo HTTP)
- Aplicación de alcances (mcp:read, mcp:write)

**Transportes:**
- stdio (clientes de IA locales)
- Streamable HTTP (alojado/remoto)
