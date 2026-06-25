### Desconectar su cliente de IA

Para que su cliente de IA deje de acceder a ITM Platform, elimine el servidor MCP de la configuración del cliente:

**Claude Code:** Ejecute `claude mcp remove itm-platform`.

**OpenAI Codex:** Ejecute `codex mcp remove itm-platform`.

**Claude Desktop:** Vaya a **Settings > Connectors**, busque la entrada de ITM Platform y elimínela.

**VS Code:** Elimine la entrada `itm-platform` de `.vscode/mcp.json`.

**Cursor:** Elimine la entrada `itm-platform` de `.cursor/mcp.json`.

**Otros clientes:** Elimine el servidor de ITM Platform del archivo de configuración MCP o los ajustes de su cliente.

Si usó una clave API y quiere invalidarla, vaya a **Mi perfil** en ITM Platform y regenere la clave. La clave anterior deja de funcionar inmediatamente.
