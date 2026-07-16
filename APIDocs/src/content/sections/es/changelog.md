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
