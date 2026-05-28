Hay dos formas de conectar tu asistente de IA a ITM Platform. Elige la que mejor se adapte a tu situacion -- siempre puedes cambiar despues.

### Conectar con OAuth (recomendado)

Agrega una sola URL a tu cliente de IA. La primera vez que lo uses, se abre una ventana del navegador para que inicies sesion con tus credenciales de ITM Platform. Sin instalacion, sin clave API, sin variables de entorno.

**Solo necesitas una linea:**

```
https://api.itmplatform.com/v2/_/mcp/
```

**Ideal para:** la mayoria de los usuarios. Funciona con Claude Code, Claude Desktop, Cursor, VS Code y cualquier cliente MCP que soporte servidores remotos.

### Conectar con clave API (alternativa)

Instala el servidor MCP en tu ordenador via npm. Tu cliente de IA inicia el servidor como un proceso local. Te autenticas con una clave API generada desde tu cuenta de ITM Platform.

```bash
npx @itm-platform/mcp-server
```

**Ideal para:** usuarios que prefieren acceso sin conexion, trabajan detras de un firewall o necesitan control total sobre el servidor.

### Como funciona MCP

MCP (Model Context Protocol) es un estandar abierto que permite a los asistentes de IA conectarse a fuentes de datos externas. Cuando haces una pregunta sobre tus proyectos, el cliente de IA envia la peticion al servidor MCP de ITM. El servidor se autentica como tu, llama a las APIs de ITM Platform y devuelve los datos a la IA para que pueda responder.

```
Haces una pregunta
  |
  v
Cliente de IA (Claude, Cursor, VS Code, Codex...)
  |  se conecta al servidor MCP (URL remota o proceso local)
  v
Servidor MCP de ITM
  |  se autentica como tu, llama a las APIs de ITM
  v
Tus datos de ITM Platform
```

Tus datos pasan por el servidor MCP hacia el cliente de IA que estes usando. La politica de tratamiento de datos del proveedor de IA aplica a todos los datos que la IA procese.
