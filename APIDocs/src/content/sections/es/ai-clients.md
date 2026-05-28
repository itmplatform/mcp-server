Hay dos formas de conectarse: **OAuth** (recomendado) se conecta al servidor alojado con solo una URL -- sin instalacion, sin claves. **Clave API** ejecuta el servidor localmente en tu maquina y se autentica con una clave de tu cuenta de ITM Platform.

Elige tu cliente de IA a continuacion. Cada uno muestra ambos metodos.

---

### Claude Code

**OAuth (recomendado):**

```bash
claude mcp add --scope user --transport http itm-platform https://api.itmplatform.com/v2/_/mcp/
```

El flag `--scope user` hace que el servidor este disponible en todos tus proyectos. Claude Code gestiona OAuth automaticamente -- tu navegador se abrira para iniciar sesion la primera vez que se llame a una herramienta.

**Clave API (local):**

```bash
claude mcp add --scope user itm-platform -- npx @itm-platform/mcp-server
```

Luego configura tus variables de entorno (consulta [Detalles de clave API](#api-key-details) mas abajo).

---

### Claude Desktop

**OAuth (recomendado):**

Ve a **Settings > Connectors > Add custom connector** e introduce la URL del servidor:

```
https://api.itmplatform.com/v2/_/mcp/
```

Claude Desktop gestiona el flujo OAuth automaticamente. Disponible en planes Pro, Max, Team y Enterprise.

**Clave API (local):**

Edita tu archivo de configuracion (`%APPDATA%\Claude\claude_desktop_config.json` en Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` en macOS):

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{tu-cuenta}",
        "ITM_API_KEY": "tu-clave-api"
      }
    }
  }
}
```

---

### VS Code (GitHub Copilot)

**OAuth (recomendado)** -- crea o edita `.vscode/mcp.json` en tu workspace:

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

Tambien puedes agregar servidores desde **Command Palette > MCP: Add Server**.

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
        "ITM_COMPANY": "{tu-cuenta}",
        "ITM_API_KEY": "tu-clave-api"
      }
    }
  }
}
```

---

### Cursor

Crea o edita `.cursor/mcp.json` en la raiz de tu proyecto (o `~/.cursor/mcp.json` para acceso global).

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

**Clave API (local):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{tu-cuenta}",
        "ITM_API_KEY": "tu-clave-api"
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

O agrega manualmente a `~/.codex/config.toml`:

```toml
[mcp_servers.itm-platform]
url = "https://api.itmplatform.com/v2/_/mcp/"
```

---

### Windsurf

Edita `~/.codeium/windsurf/mcp_config.json` (o `%USERPROFILE%\.codeium\windsurf\mcp_config.json` en Windows):

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

**Clave API (local):**

```json
{
  "mcpServers": {
    "itm-platform": {
      "command": "npx",
      "args": ["@itm-platform/mcp-server"],
      "env": {
        "ITM_API_URL": "https://api.itmplatform.com",
        "ITM_COMPANY": "{tu-cuenta}",
        "ITM_API_KEY": "tu-clave-api"
      }
    }
  }
}
```

---

### JetBrains (AI Assistant)

Ve a **Settings > Tools > AI Assistant > Model Context Protocol (MCP)** y haz clic en **Add**.

**OAuth (recomendado):** selecciona el protocolo HTTP e introduce `https://api.itmplatform.com/v2/_/mcp/`.

**Clave API (local):** selecciona el protocolo stdio y usa el comando `npx @itm-platform/mcp-server` con las variables de entorno requeridas.

---

### Otros clientes MCP

Cualquier cliente que implemente el [Model Context Protocol](https://modelcontextprotocol.io) puede conectarse:

| Metodo | Valor |
|--------|-------|
| **URL remota (OAuth)** | `https://api.itmplatform.com/v2/_/mcp/` |
| **Comando local (Clave API)** | `npx @itm-platform/mcp-server` |

---

### Sobre OAuth

La primera vez que te conectes via OAuth, tu cliente de IA abrira una ventana del navegador. Inicia sesion con tus credenciales de ITM Platform y concede el acceso. El cliente de IA recibe un token con alcance limitado:

| Alcance | Que permite |
|---------|-------------|
| `mcp:read` | Buscar proyectos, ver presupuestos, listar tareas, consultar el portafolio |
| `mcp:write` | Todo lo anterior, mas crear tareas, registrar riesgos/incidencias, actualizar proyectos |

OAuth permite a la IA actuar en tu nombre sin ver nunca tu contrasena.

### <a id="api-key-details"></a>Sobre claves API

Para usar el metodo local (Clave API), genera una clave en tu cuenta de ITM Platform:

1. Inicia sesion y ve a **Mi perfil** (haz clic en tu avatar en la esquina superior derecha)
2. En **Clave API**, haz clic en **Generar**
3. Copia la clave

Tu cliente de IA necesita tres variables de entorno:

| Variable | Valor |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | El slug de tu empresa/cuenta (el nombre en tu URL de ITM Platform) |
| `ITM_API_KEY` | La clave que acabas de generar |

**Cuando usar claves API en lugar de OAuth:**

- Trabajas detras de un firewall corporativo que bloquea el servidor alojado
- Quieres que el servidor MCP funcione completamente sin conexion
- Necesitas apuntar el servidor a una instancia de ITM Platform auto-alojada
- Quieres inspeccionar o personalizar el comportamiento del servidor localmente
