El servidor MCP expone recursos y prompts ademas de herramientas. Los recursos proporcionan informacion de esquema y datos de calendario. Los prompts son flujos de trabajo predefinidos que combinan multiples llamadas a herramientas.

### Recursos

Los recursos son datos de solo lectura a los que la IA puede acceder sin una llamada a herramienta especifica.

| URI del recurso | Descripcion |
|-----------------|-------------|
| `itm://schema/component` | Esquema de componentes de DataMart -- campos disponibles, tipos y enumeraciones para proyectos y servicios |
| `itm://schema/tasks` | Esquema de tareas de DataMart -- campos disponibles en subcomponentes de tareas |
| `itm://schema/purchases` | Esquema de compras de DataMart -- campos en subcomponentes de compras |
| `itm://schema/risks` | Esquema de riesgos de DataMart -- campos en subcomponentes de riesgos |
| `itm://schema/issues` | Esquema de incidencias de DataMart -- campos en subcomponentes de incidencias |
| `itm://calendars/{projectId}` | Calendario de festivos y horario laboral para un proyecto especifico |

Los recursos de esquema ayudan a la IA a entender que campos estan disponibles al construir consultas o interpretar resultados. El recurso de calendario proporciona informacion de dias laborables para calculos de planificacion.

### Prompts

Los prompts son flujos de trabajo predefinidos que combinan multiples llamadas a herramientas en una sola solicitud estructurada. Dan a la IA instrucciones claras sobre que datos obtener y como presentarlos.

| Prompt | Argumentos | Que hace |
|--------|------------|----------|
| `/project_status` | `projectId` (obligatorio) | Obtiene un proyecto con tareas, riesgos, incidencias y presupuesto. Indica a la IA que resuma la salud general, avance de tareas, riesgos activos, incidencias abiertas y estado del presupuesto. |
| `/portfolio_overview` | ninguno | Agrega proyectos por estado y metodologia. Indica a la IA que resuma metricas a nivel de portafolio: total de proyectos, distribucion por estado, salud presupuestaria y patrones preocupantes. |
| `/team_workload` | `userId` (opcional) | Obtiene usuarios y sus asignaciones a proyectos. Opcionalmente se enfoca en un usuario especifico. Indica a la IA que resuma asignaciones y patrones de carga de trabajo. |
| `/risk_analysis` | `projectId` (obligatorio) | Obtiene riesgos, incidencias y presupuesto de un proyecto. Indica a la IA que analice la exposicion al riesgo, probabilidad/impacto, desviacion presupuestaria y recomiende acciones. |
