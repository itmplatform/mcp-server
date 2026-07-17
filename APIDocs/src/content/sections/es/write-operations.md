La IA puede modificar sus datos de ITM Platform, no solo leerlos. Las operaciones de escritura cubren proyectos, servicios, tareas, actividades, riesgos e incidencias.

### Operaciones de escritura disponibles

| Operación | Qué hace |
|-----------|---------|
| **Crear proyecto** | Crea un proyecto Waterfall o Kanban; se crea con el estado predeterminado de la cuenta y el usuario creador como jefe de proyecto |
| **Crear tarea** | Agrega una tarea, hito o tarea resumen a un proyecto; ParentId construye la jerarquía del Gantt en proyectos Waterfall |
| **Actualizar tarea** | Cambia nombre, estado, prioridad, fechas, tipo de elemento o tarea padre |
| **Crear seguimiento de tarea** | Reporta el avance de una tarea (porcentaje, valoración, notas). Dispara los mismos efectos que reportar avance en la aplicación: transiciones de estado, propagación a tareas resumen y avance automático del proyecto |
| **Actualizar seguimiento de tarea** | Corrige una entrada de seguimiento existente |
| **Crear riesgo** | Registra un nuevo riesgo en un proyecto. Tipo, estado, impacto, probabilidad y nivel son obligatorios; los IDs válidos se descubren con la herramienta de datos de referencia (incluida la entidad `risklevels`) |
| **Actualizar riesgo** | Cambia estado, tipo, probabilidad, impacto, nivel o los planes de mitigación y contingencia del riesgo |
| **Crear incidencia** | Registra una nueva incidencia en un proyecto |
| **Actualizar incidencia** | Cambia nombre, estado, tipo o resolución final de la incidencia |
| **Actualizar proyecto** | Cambia nombre, estado, prioridad o fechas del proyecto |
| **Crear servicio** | Crea un servicio; se crea con el estado predeterminado de la cuenta. Los tipos de servicio se descubren con la entidad de referencia `servicetypes` |
| **Actualizar servicio** | Cambia nombre, estado, prioridad o fechas del servicio |
| **Crear actividad** | Agrega una actividad a un servicio (las actividades forman una lista plana: sin hitos, tareas resumen ni jerarquía) |
| **Actualizar actividad** | Cambia nombre, estado, descripción o fechas de la actividad |
| **Cambio masivo de estado de tareas** | Aplica un estado a hasta 100 tareas de un proyecto en una sola llamada |
| **Cambio masivo de estado de actividades** | Aplica un estado a hasta 100 actividades de un servicio en una sola llamada |

### Cambios de estado masivos

Las herramientas masivas devuelven un resumen compacto por lote (`requested`, `succeeded`, `failed`) en lugar de la relectura completa de cada registro. El lote completo se ejecuta en una única transacción de base de datos en el servidor: un error inesperado revierte todo el lote, mientras que los fallos de validación por elemento se reportan en el array `failed` sin bloquear al resto. Reaplicar el mismo estado es inocuo, por lo que reintentar un lote fallido es seguro.

### Diseño de seguridad

Cada operación de escritura sigue el mismo patrón:

1. **Verificación en origen**: Después de la escritura, el servidor relee el registro actualizado desde la API REST v2 para confirmar que se guardó correctamente. Si la verificación no coincide con los cambios solicitados, el servidor reporta un error.
2. **Registro de auditoría**: Cuando está habilitado, cada llamada a herramienta se registra con el usuario, marca de tiempo, nombre de herramienta y resultado.

### Consistencia eventual de DataMart

Después de una operación de escritura, los datos en DataMart (usados por las herramientas de lectura) pueden tardar de 5 a 60 segundos en reflejar el cambio. La confirmación de escritura viene de la API REST v2 (fuente de verdad), así que verá el resultado correcto inmediatamente en la respuesta. Las búsquedas posteriores pueden mostrar datos desactualizados durante un breve período.

### Requisitos de alcance

Cuando usa OAuth (configuración alojada), las operaciones de escritura requieren el alcance `mcp:write`. Si su token solo tiene `mcp:read`, las herramientas de escritura devolverán un error de permisos. Cuando usa una clave API (configuración local), todas las operaciones están disponibles según su tipo de licencia y rol en ITM Platform.
