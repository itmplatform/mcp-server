El servidor MCP expone recursos y prompts además de herramientas. Los recursos proporcionan información de esquema y datos de calendario. Los prompts son flujos de trabajo predefinidos que combinan múltiples llamadas a herramientas.

### Recursos

Los recursos son datos de solo lectura a los que la IA puede acceder sin una llamada a herramienta específica.

| URI del recurso | Descripción |
|-----------------|-------------|
| `itm://schema/component` | Esquema de componentes de DataMart -- campos disponibles, tipos y enumeraciones para proyectos y servicios |
| `itm://schema/tasks` | Esquema de tareas de DataMart -- campos disponibles en subcomponentes de tareas |
| `itm://schema/purchases` | Esquema de compras de DataMart -- campos en subcomponentes de compras |
| `itm://schema/risks` | Esquema de riesgos de DataMart -- campos en subcomponentes de riesgos |
| `itm://schema/issues` | Esquema de incidencias de DataMart -- campos en subcomponentes de incidencias |
| `itm://calendars/{projectId}` | Calendario de festivos y horario laboral para un proyecto específico |

Los recursos de esquema ayudan a la IA a entender qué campos están disponibles al construir consultas o interpretar resultados. El recurso de calendario proporciona información de días laborables para cálculos de planificación.

### Prompts

Los prompts son flujos de trabajo predefinidos que combinan múltiples llamadas a herramientas en una sola solicitud estructurada. Dan a la IA instrucciones claras sobre qué datos obtener y cómo presentarlos.

| Prompt | Argumentos | Qué hace |
|--------|------------|----------|
| `/project_status` | `projectId` (obligatorio) | Obtiene un proyecto con tareas, riesgos, incidencias y presupuesto. Indica a la IA que resuma la salud general, avance de tareas, riesgos activos, incidencias abiertas y estado del presupuesto. |
| `/portfolio_overview` | ninguno | Agrega proyectos por estado y metodología. Indica a la IA que resuma métricas a nivel de portafolio: total de proyectos, distribución por estado, salud presupuestaria y patrones preocupantes. |
| `/team_workload` | `userId` (opcional) | Obtiene usuarios y sus asignaciones a proyectos. Opcionalmente se enfoca en un usuario específico. Indica a la IA que resuma asignaciones y patrones de carga de trabajo. |
| `/risk_analysis` | `projectId` (obligatorio) | Obtiene riesgos, incidencias y presupuesto de un proyecto. Indica a la IA que analice la exposición al riesgo, probabilidad/impacto, desviación presupuestaria y recomiende acciones. |
