### Desconectar su cliente de IA

Para que su cliente de IA deje de acceder a ITM Platform, elimine el servidor MCP de la configuracion del cliente:

**Claude Code:** Ejecute `claude mcp remove itm-platform`.

**OpenAI Codex:** Ejecute `codex mcp remove itm-platform`.

**Claude Desktop:** Vaya a **Settings > Connectors**, busque la entrada de ITM Platform y eliminela.

**VS Code:** Elimine la entrada `itm-platform` de `.vscode/mcp.json`.

**Cursor:** Elimine la entrada `itm-platform` de `.cursor/mcp.json`.

**Otros clientes:** Elimine el servidor de ITM Platform del archivo de configuracion MCP o los ajustes de su cliente.

Si uso una clave API y quiere invalidarla, vaya a **Mi perfil** en ITM Platform y regenere la clave. La clave anterior deja de funcionar inmediatamente.

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

Cuando le da a un asistente de IA acceso a datos de proyectos, quiere saber que hizo. El registro de auditoria proporciona un registro de cada llamada a herramienta realizada a traves del servidor MCP, para que pueda rastrear la actividad iniciada por IA.
