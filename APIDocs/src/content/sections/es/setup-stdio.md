Use este metodo si prefiere ejecutar el servidor MCP en su propio ordenador. El cliente de IA inicia el servidor como un proceso local y se comunica con el directamente. Se autentica con una clave API de su cuenta de ITM Platform.

### Paso 1: Genere una clave API

1. Inicie sesion en su cuenta de ITM Platform
2. Vaya a **Mi perfil** (haga clic en su avatar en la esquina superior derecha)
3. En **Clave API**, haga clic en **Generar** para crear una nueva clave
4. Copie la clave -- la necesitara en el siguiente paso

### Paso 2: Configure su cliente de IA

Su cliente de IA necesita tres variables de entorno para conectarse:

| Variable | Valor |
|----------|-------|
| `ITM_API_URL` | `https://api.itmplatform.com` |
| `ITM_COMPANY` | El slug de su empresa/cuenta (el nombre en su URL de ITM Platform) |
| `ITM_API_KEY` | La clave API que genero en el Paso 1 |

El servidor se ejecuta via npm -- no necesita instalacion global:

```bash
npx @itm-platform/mcp-server
```

Consulte [Configuracion por cliente de IA](#ai-clients) para la configuracion exacta de Claude, VS Code, Cursor y otros clientes.

### Paso 3: Verifique la conexion

Despues de agregar la configuracion, reinicie su cliente de IA. Escriba `/mcp` donde se admitan comandos con barra, o abra la lista de servidores MCP del cliente, y confirme que `itm-platform` esta conectado. Luego haga una pregunta como:

> "Cuantos proyectos tengo en ITM Platform?"

Si la IA devuelve datos de proyectos, la conexion esta funcionando.

### Cuando usar este metodo

- Trabaja detras de un firewall corporativo que bloquea conexiones al servidor alojado
- Quiere que el servidor MCP funcione completamente sin conexion
- Necesita apuntar el servidor a una instancia de ITM Platform auto-alojada
- Quiere inspeccionar o personalizar el comportamiento del servidor localmente
