### Revocar acceso

Puedes desconectar tu cliente de IA en cualquier momento:

**Si usaste una clave API (configuracion local):**
1. Ve a **Configuracion de usuario** en ITM Platform
2. En **Clave API**, haz clic en **Regenerar**
3. La clave antigua se invalida inmediatamente. El cliente de IA dejara de funcionar hasta que configures una nueva clave.

**Si usaste OAuth (configuracion alojada):**
1. Ve a **Configuracion de usuario** en ITM Platform
2. En **Aplicaciones conectadas**, busca la entrada del servidor MCP
3. Haz clic en **Revocar**
4. El token del cliente de IA se invalida inmediatamente

### Revisar actividad

Cada operacion de escritura realizada por la IA se registra en el log de auditoria. Cada entrada incluye:

| Campo | Descripcion |
|-------|-------------|
| **Quien** | El usuario cuyas credenciales se usaron |
| **Cuando** | Fecha y hora de la operacion |
| **Herramienta** | Que herramienta MCP se llamo (ej. `create_task`, `update_project`) |
| **Que cambio** | Los campos que se modificaron y sus nuevos valores |
| **Cliente de IA** | Que cliente de IA inicio la solicitud |

Los Company Admins pueden revisar las entradas del log de auditoria para ver todos los cambios iniciados por IA en la organizacion.

### Por que esto importa

Cuando le das a un asistente de IA acceso de escritura a datos de proyectos y financieros, necesitas saber exactamente que cambio. El log de auditoria proporciona un registro completo de cada modificacion iniciada por IA, para que puedas verificar cambios y solucionar problemas.
