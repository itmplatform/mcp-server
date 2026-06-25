Use este método si prefiere ejecutar el servidor MCP en su propio ordenador. El cliente de IA inicia el servidor como un proceso local y se comunica con él directamente. Se autentica con una clave API de su cuenta de ITM Platform.

### Paso 1: Genere una clave API

1. Inicie sesión en su cuenta de ITM Platform
2. Vaya a **Mi perfil** (haga clic en su avatar en la esquina superior derecha)
3. En **Clave API**, haga clic en **Generar** para crear una nueva clave
4. Copie la clave -- la necesitará en el siguiente paso

### Paso 2: Configure su cliente de IA

Su cliente de IA necesita tres variables de entorno para conectarse:

| Variable | Valor |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | El slug de su empresa/cuenta (el nombre en su URL de ITM Platform) |
| `ITM_API_KEY` | La clave API que generó en el Paso 1 |

El servidor se ejecuta vía npm -- no necesita instalación global:

```bash
npx @itm-platform/mcp-server
```

Consulte [Configuración por cliente de IA](#ai-clients) para la configuración exacta de Claude, VS Code, Cursor y otros clientes.

### Paso 3: Verifique la conexión

Después de agregar la configuración, reinicie su cliente de IA. Escriba `/mcp` donde se admitan comandos con barra, o abra la lista de servidores MCP del cliente, y confirme que `itm-platform` está conectado. Luego haga una pregunta como:

> "¿Cuántos proyectos tengo en ITM Platform?"

Si la IA devuelve datos de proyectos, la conexión está funcionando.

### Cuándo usar este método

- Trabaja detrás de un firewall corporativo que bloquea conexiones al servidor alojado
- Quiere que el servidor MCP funcione completamente sin conexión
- Necesita apuntar el servidor a una instancia de ITM Platform auto-alojada
- Quiere inspeccionar o personalizar el comportamiento del servidor localmente
