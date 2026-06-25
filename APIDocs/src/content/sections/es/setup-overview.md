Hay dos formas de conectar su asistente de IA a ITM Platform. Elija la que mejor se adapte a su situación -- siempre puede cambiar después.

### Conectar con OAuth (recomendado)

Agregue una sola URL a su cliente de IA. Luego abra MCP en el cliente -- escriba `/mcp` donde se admitan comandos con barra -- seleccione `itm-platform` y autentíquese con sus credenciales de ITM Platform. Sin instalación, sin clave API, sin variables de entorno.

**Solo necesita una línea:**

```
https://api.itmplatform.com/v2/_/mcp/
```

Después de agregar la URL, use `/mcp` o la lista de servidores MCP de su cliente para conectarse a `itm-platform` y completar el inicio de sesión OAuth.

**Ideal para:** la mayoría de los usuarios. Funciona con Claude Code, Claude Desktop, Cursor, VS Code y cualquier cliente MCP que soporte servidores remotos.

### Conectar con clave API (alternativa)

Instale el servidor MCP en su ordenador vía npm. Su cliente de IA inicia el servidor como un proceso local. Se autentica con una clave API generada desde su cuenta de ITM Platform.

```bash
npx @itm-platform/mcp-server
```

Después de configurar el servidor local, reinicie su cliente de IA y use `/mcp` o la lista de servidores MCP del cliente para confirmar que `itm-platform` está conectado.

**Ideal para:** usuarios que prefieren acceso sin conexión, trabajan detrás de un firewall o necesitan control total sobre el servidor.

### Cómo funciona MCP

MCP (Model Context Protocol) es un estándar abierto que permite a los asistentes de IA conectarse a fuentes de datos externas. Cuando hace una pregunta sobre sus proyectos, el cliente de IA envía la petición al servidor MCP de ITM. El servidor se autentica como usted, llama a las APIs de ITM Platform y devuelve los datos a la IA para que pueda responder.

```
Hace una pregunta
  |
  v
Cliente de IA (Claude, Cursor, VS Code, Codex...)
  |  se conecta al servidor MCP (URL remota o proceso local)
  v
Servidor MCP de ITM
  |  se autentica como usted, llama a las APIs de ITM
  v
Sus datos de ITM Platform
```

Sus datos pasan por el servidor MCP hacia el cliente de IA que esté usando. La política de tratamiento de datos del proveedor de IA aplica a todos los datos que la IA procese.
