Hay dos formas de conectar tu asistente de IA a ITM Platform:

### Configuracion local (clave API)

Instala el servidor MCP en tu ordenador. Tu cliente de IA inicia el servidor como un proceso local y se comunica con el directamente. Te autenticas con una clave API de tu cuenta de ITM Platform.

**Ideal para:** usuarios que ejecutan un cliente de IA en su propio ordenador (Claude Desktop, Claude Code, Cursor, VS Code).

### Configuracion alojada (OAuth)

Apunta tu cliente de IA a la URL del servidor alojado. La primera vez que te conectes, autorizas el acceso con tu inicio de sesion de ITM Platform. Sin instalacion, sin clave API.

**Ideal para:** usuarios que quieren configuracion cero, o cuyo cliente de IA soporta servidores MCP remotos.

### Como funciona MCP

MCP (Model Context Protocol) es un estandar que permite a los asistentes de IA conectarse a fuentes de datos externas. Cuando haces una pregunta sobre tus proyectos, el cliente de IA envia la peticion al servidor MCP de ITM. El servidor se autentica como tu, llama a las APIs de ITM Platform y devuelve los datos a la IA para que pueda responder tu pregunta.

```
Haces una pregunta
  |
  v
Cliente de IA (Claude, Codex, VS Code...)
  |  inicia el servidor MCP o se conecta via URL
  v
Servidor MCP de ITM
  |  se autentica como tu, llama a las APIs de ITM
  v
Tus datos de ITM Platform
```

Tus datos pasan por el servidor MCP hacia el cliente de IA que estes usando. La politica de tratamiento de datos del proveedor de IA aplica a todos los datos que la IA procese.
