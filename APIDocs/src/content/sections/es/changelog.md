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
