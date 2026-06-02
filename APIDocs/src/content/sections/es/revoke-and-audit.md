### Desconectar tu cliente de IA

Para que tu cliente de IA deje de acceder a ITM Platform, elimina el servidor MCP de la configuracion del cliente:

**Claude Code:** Ejecuta `claude mcp remove itm-platform`.

**OpenAI Codex:** Ejecuta `codex mcp remove itm-platform`.

**Claude Desktop:** Ve a **Settings > Connectors**, busca la entrada de ITM Platform y eliminala.

**VS Code:** Elimina la entrada `itm-platform` de `.vscode/mcp.json`.

**Cursor:** Elimina la entrada `itm-platform` de `.cursor/mcp.json`.

**Otros clientes:** Elimina el servidor de ITM Platform del archivo de configuracion MCP o los ajustes de tu cliente.

Si usaste una clave API y quieres invalidarla, ve a **Mi perfil** en ITM Platform y regenera la clave. La clave anterior deja de funcionar inmediatamente.

### Registro de auditoria

Cuando el registro de auditoria esta habilitado en el servidor, cada llamada a herramienta se registra con:

| Campo | Descripcion |
|-------|-------------|
| **Usuario** | El usuario cuyas credenciales se usaron |
| **Marca de tiempo** | Cuando ocurrio la operacion |
| **Herramienta** | Que herramienta MCP se llamo (ej. `create_task`, `update_project`) |
| **Resultado** | Si la operacion se completo o fallo |
| **Cliente de IA** | Que cliente de IA inicio la solicitud |

### Por que esto importa

Cuando le das a un asistente de IA acceso a datos de proyectos, quieres saber que hizo. El registro de auditoria proporciona un registro de cada llamada a herramienta realizada a traves del servidor MCP, para que puedas rastrear la actividad iniciada por IA.
