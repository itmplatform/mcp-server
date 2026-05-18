La IA puede modificar tus datos de ITM Platform, no solo leerlos. Las operaciones de escritura incluyen crear tareas, actualizar proyectos y registrar riesgos o incidencias.

### Operaciones de escritura disponibles

| Operacion | Que hace |
|-----------|---------|
| **Crear tarea** | Agrega una nueva tarea a un proyecto |
| **Actualizar tarea** | Cambia nombre, estado, prioridad o fechas de una tarea |
| **Crear riesgo** | Registra un nuevo riesgo en un proyecto |
| **Crear incidencia** | Registra una nueva incidencia en un proyecto |
| **Actualizar proyecto** | Cambia nombre, estado, prioridad o fechas del proyecto |

### Diseno de seguridad

Cada operacion de escritura sigue el mismo patron:

1. **Confirmacion**: La IA te dice lo que va a hacer antes de realizar el cambio
2. **Verificacion en origen**: Despues de la escritura, el servidor relee el registro actualizado desde la API REST v2 para confirmar que se guardo correctamente
3. **Registro de auditoria**: Cada escritura se registra con quien hizo el cambio, cuando, que herramienta se uso y que campos se modificaron

### Consistencia eventual de DataMart

Despues de una operacion de escritura, los datos en DataMart (usados por las herramientas de lectura) pueden tardar de 5 a 60 segundos en reflejar el cambio. La confirmacion de escritura viene de la API REST v2 (fuente de verdad), asi que veras el resultado correcto inmediatamente en la respuesta. Las busquedas posteriores pueden mostrar datos desactualizados durante un breve periodo.

### Requisitos de alcance

Cuando usas OAuth (configuracion alojada), las operaciones de escritura requieren el alcance `mcp:write`. Si tu token solo tiene `mcp:read`, las herramientas de escritura devolveran un error de permisos. Cuando usas una clave API (configuracion local), todas las operaciones estan disponibles segun tu tipo de licencia y rol en ITM Platform.
