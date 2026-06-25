La IA puede modificar sus datos de ITM Platform, no solo leerlos. Las operaciones de escritura incluyen crear tareas, actualizar proyectos y registrar riesgos o incidencias.

### Operaciones de escritura disponibles

| Operación | Qué hace |
|-----------|---------|
| **Crear tarea** | Agrega una nueva tarea a un proyecto |
| **Actualizar tarea** | Cambia nombre, estado, prioridad o fechas de una tarea |
| **Crear riesgo** | Registra un nuevo riesgo en un proyecto |
| **Crear incidencia** | Registra una nueva incidencia en un proyecto |
| **Actualizar proyecto** | Cambia nombre, estado, prioridad o fechas del proyecto |

### Diseño de seguridad

Cada operación de escritura sigue el mismo patrón:

1. **Verificación en origen**: Después de la escritura, el servidor relee el registro actualizado desde la API REST v2 para confirmar que se guardó correctamente. Si la verificación no coincide con los cambios solicitados, el servidor reporta un error.
2. **Registro de auditoría**: Cuando está habilitado, cada llamada a herramienta se registra con el usuario, marca de tiempo, nombre de herramienta y resultado.

### Consistencia eventual de DataMart

Después de una operación de escritura, los datos en DataMart (usados por las herramientas de lectura) pueden tardar de 5 a 60 segundos en reflejar el cambio. La confirmación de escritura viene de la API REST v2 (fuente de verdad), así que verá el resultado correcto inmediatamente en la respuesta. Las búsquedas posteriores pueden mostrar datos desactualizados durante un breve período.

### Requisitos de alcance

Cuando usa OAuth (configuración alojada), las operaciones de escritura requieren el alcance `mcp:write`. Si su token solo tiene `mcp:read`, las herramientas de escritura devolverán un error de permisos. Cuando usa una clave API (configuración local), todas las operaciones están disponibles según su tipo de licencia y rol en ITM Platform.
