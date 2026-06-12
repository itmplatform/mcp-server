Hay dos formas de conectarse: **OAuth** (recomendado) se conecta al servidor alojado con solo una URL -- sin instalacion, sin claves. **Clave API** ejecuta el servidor localmente en su maquina y se autentica con una clave de su cuenta de ITM Platform.

Elija su cliente de IA a continuacion. Cada uno muestra ambos metodos.

Despues de agregar el servidor, abra MCP en su cliente -- escriba `/mcp` donde se admitan comandos con barra -- seleccione `itm-platform` y autentiquese cuando se le solicite.

---

### Claude Code

**OAuth (recomendado):**

```bash
claude mcp add --scope user --transport http itm-platform https://api.itmplatform.com/v2/_/mcp/
```

El flag `--scope user` hace que el servidor este disponible en todos sus proyectos. Luego escriba `/mcp`, seleccione `itm-platform` y complete el inicio de sesion de ITM Platform cuando se le solicite.

**Clave API (local):**

```bash
claude mcp add --scope user itm-platform -- npx @itm-platform/mcp-server
```

Luego configure sus variables de entorno (consulte [Detalles de clave API](#api-key-details) mas abajo).

---

### Claude Desktop

**OAuth (recomendado):**

Vaya a **Settings > Connectors > Add custom connector** e introduzca la URL del servidor:

```
https://api.itmplatform.com/v2/_/mcp/
```

Claude Desktop gestiona el flujo OAuth automaticamente. Disponible en planes Pro, Max, Team y Enterprise.

Despues de agregar el conector, escriba `/mcp`, seleccione el conector de ITM Platform y autentiquese cuando se le solicite.

**Clave API (local):**

Edite su archivo de configuracion (`%APPDATA%\Claude\claude_desktop_config.json` en Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` en macOS):

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{su-cuenta}",
        "ITM_API_KEY": "su-clave-api"
      }
    }
  }
}
```

---

### VS Code (GitHub Copilot)

**OAuth (recomendado)** -- cree o edite `.vscode/mcp.json` en su workspace:

```json
{
  "servers": {
    "itm-platform": {
      "type": "http",
      "url": "https://api.itmplatform.com/v2/_/mcp/"
    }
  }
}
```

Tambien puede agregar servidores desde **Command Palette > MCP: Add Server**.

Despues de agregar el servidor, abra Copilot Chat, escriba `/mcp`, seleccione `itm-platform` y autentiquese cuando se le solicite.

**Clave API (local):**

```json
{
  "servers": {
    "itm-platform": {
      "type": "stdio",
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{su-cuenta}",
        "ITM_API_KEY": "su-clave-api"
      }
    }
  }
}
```

---

### Cursor

Cree o edite `.cursor/mcp.json` en la raiz de su proyecto (o `~/.cursor/mcp.json` para acceso global).

**OAuth (recomendado):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "url": "https://api.itmplatform.com/v2/_/mcp/"
    }
  }
}
```

Despues de agregar el servidor, reinicie Cursor, escriba `/mcp`, seleccione `itm-platform` y autentiquese cuando se le solicite.

**Clave API (local):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{su-cuenta}",
        "ITM_API_KEY": "su-clave-api"
      }
    }
  }
}
```

---

### OpenAI Codex

**OAuth (recomendado):**

```bash
codex mcp add itm-platform --url https://api.itmplatform.com/v2/_/mcp/
```

O agregue manualmente a `~/.codex/config.toml`:

```toml
[mcp_servers.itm-platform]
url = "https://api.itmplatform.com/v2/_/mcp/"
```

Despues de agregar el servidor, inicie Codex, escriba `/mcp`, seleccione `itm-platform` y autentiquese cuando se le solicite.

---

### Windsurf

Edite `~/.codeium/windsurf/mcp_config.json` (o `%USERPROFILE%\.codeium\windsurf\mcp_config.json` en Windows):

**OAuth (recomendado):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "serverUrl": "https://api.itmplatform.com/v2/_/mcp/"
    }
  }
}
```

Despues de agregar el servidor, reinicie Windsurf, escriba `/mcp`, seleccione `itm-platform` y autentiquese cuando se le solicite.

**Clave API (local):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{su-cuenta}",
        "ITM_API_KEY": "su-clave-api"
      }
    }
  }
}
```

---

### JetBrains (AI Assistant)

Vaya a **Settings > Tools > AI Assistant > Model Context Protocol (MCP)** y haga clic en **Add**.

**OAuth (recomendado):** seleccione el protocolo HTTP e introduzca `https://api.itmplatform.com/v2/_/mcp/`.

Despues de agregar el servidor, abra AI Assistant, escriba `/mcp` donde se admitan comandos con barra, o abra el panel de servidores MCP. Seleccione `itm-platform` y autentiquese cuando se le solicite.

**Clave API (local):** seleccione el protocolo stdio y use el comando `npx @itm-platform/mcp-server` con las variables de entorno requeridas.

---

### Otros clientes MCP

Cualquier cliente que implemente el [Model Context Protocol](https://modelcontextprotocol.io) puede conectarse:

| Metodo | Valor |
|--------|-------|
| **URL remota (OAuth)** | `https://api.itmplatform.com/v2/_/mcp/` |
| **Comando local (Clave API)** | `npx @itm-platform/mcp-server` |

Despues de agregar el servidor, use el comando MCP o la lista de servidores del cliente. Si el cliente admite comandos con barra, escriba `/mcp`, seleccione `itm-platform` y autentiquese cuando se le solicite.

---

### Sobre OAuth

La primera vez que se conecte via OAuth, abra MCP en su cliente y seleccione `itm-platform`. En clientes que admiten comandos con barra, escriba `/mcp`. El cliente abre una ventana del navegador para que inicie sesion con sus credenciales de ITM Platform y conceda el acceso. El cliente de IA recibe un token con alcance limitado:

| Alcance | Que permite |
|---------|-------------|
| `mcp:read` | Buscar proyectos, ver presupuestos, listar tareas, consultar el portafolio |
| `mcp:write` | Todo lo anterior, mas crear tareas, registrar riesgos/incidencias, actualizar proyectos |

OAuth permite a la IA actuar en su nombre sin ver nunca su contrasena.

### <a id="api-key-details"></a>Sobre claves API

Para usar el metodo local (Clave API), genere una clave en su cuenta de ITM Platform:

1. Inicie sesion y vaya a **Mi perfil** (haga clic en su avatar en la esquina superior derecha)
2. En **Clave API**, haga clic en **Generar**
3. Copie la clave

Su cliente de IA necesita tres variables de entorno:

| Variable | Valor |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | El slug de su empresa/cuenta (el nombre en su URL de ITM Platform) |
| `ITM_API_KEY` | La clave que acaba de generar |

**Cuando usar claves API en lugar de OAuth:**

- Trabaja detras de un firewall corporativo que bloquea el servidor alojado
- Quiere que el servidor MCP funcione completamente sin conexion
- Necesita apuntar el servidor a una instancia de ITM Platform auto-alojada
- Quiere inspeccionar o personalizar el comportamiento del servidor localmente
