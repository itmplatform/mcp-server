Usa este metodo si prefieres ejecutar el servidor MCP en tu propio ordenador. El cliente de IA inicia el servidor como un proceso local y se comunica con el directamente. Te autenticas con una clave API de tu cuenta de ITM Platform.

### Paso 1: Genera una clave API

1. Inicia sesion en tu cuenta de ITM Platform
2. Ve a **Mi perfil** (haz clic en tu avatar en la esquina superior derecha)
3. En **Clave API**, haz clic en **Generar** para crear una nueva clave
4. Copia la clave -- la necesitaras en el siguiente paso

### Paso 2: Configura tu cliente de IA

Tu cliente de IA necesita tres variables de entorno para conectarse:

| Variable | Valor |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | El slug de tu empresa/cuenta (el nombre en tu URL de ITM Platform) |
| `ITM_API_KEY` | La clave API que generaste en el Paso 1 |

El servidor se ejecuta via npm -- no necesitas instalacion global:

```bash
npx @itm-platform/mcp-server
```

Consulta [Configuracion por cliente de IA](#ai-clients) para la configuracion exacta de Claude, VS Code, Cursor y otros clientes.

### Paso 3: Verifica la conexion

Despues de agregar la configuracion, reinicia tu cliente de IA. Luego haz una pregunta como:

> "Cuantos proyectos tengo en ITM Platform?"

Si la IA devuelve datos de proyectos, la conexion esta funcionando.

### Cuando usar este metodo

- Trabajas detras de un firewall corporativo que bloquea conexiones al servidor alojado
- Quieres que el servidor MCP funcione completamente sin conexion
- Necesitas apuntar el servidor a una instancia de ITM Platform auto-alojada
- Quieres inspeccionar o personalizar el comportamiento del servidor localmente
