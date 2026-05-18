### Claude Desktop

**Archivo de configuracion:** `%APPDATA%\Claude\claude_desktop_config.json` (Windows) o `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

Agrega la entrada `mcpServers` a tu archivo de configuracion. Para configuracion local, usa la configuracion stdio mostrada en el panel de configuracion. Para configuracion alojada, usa la variante HTTP.

### Claude Code

Ejecuta este comando para agregar el servidor MCP:

```
claude mcp add itm-platform -- npx -y itm-mcp
```

Luego configura tus variables de entorno:

```
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY={your-account}
ITM_API_KEY=tu-clave-api
```

Para configuracion alojada, usa:

```
claude mcp add itm-platform --transport http --url https://mcp.itmplatform.com/mcp
```

### OpenAI Codex

Agrega el servidor MCP a tu configuracion de Codex. Codex soporta transportes stdio y HTTP. Usa los fragmentos de configuracion del panel de configuracion.

### VS Code (Copilot)

Agrega a tu `settings.json` de VS Code (configuracion de usuario o workspace):

```json
{
  "mcp.servers": {
    "itm-platform": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "itm-mcp"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{your-account}",
        "ITM_API_KEY": "tu-clave-api"
      }
    }
  }
}
```

### Cursor

Crea un archivo `.cursor/mcp.json` en la raiz de tu proyecto con la configuracion stdio.

### JetBrains

Ve a **Settings > Tools > AI Assistant > MCP Servers** y agrega un nuevo servidor con la configuracion stdio o HTTP.
