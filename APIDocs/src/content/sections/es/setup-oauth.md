Esta es la forma mas rapida de empezar. Tu cliente de IA se conecta al servidor MCP de ITM Platform por internet. Sin instalacion, sin claves API -- solo una URL y tu inicio de sesion de ITM Platform.

Si prefieres ejecutar el servidor localmente, consulta [Conectar con clave API](#setup-stdio).

### Paso 1: Agrega la URL del servidor

En la configuracion MCP de tu cliente de IA, agrega la URL del servidor:

```
https://api.itmplatform.com/v2/_/mcp/
```

El formato exacto varia segun el cliente. Consulta [Configuracion por cliente de IA](#ai-clients) para instrucciones paso a paso para Claude, VS Code, Cursor, Codex, Windsurf y otros.

### Paso 2: Autoriza

La primera vez que uses la conexion, tu cliente de IA abrira una ventana del navegador. Inicia sesion con tus credenciales de ITM Platform y concede el acceso. El cliente de IA recibe un token que le permite actuar en tu nombre.

### Paso 3: Empieza a preguntar

Hazle una pregunta a la IA sobre tus proyectos. La autorizacion se recuerda -- no necesitaras iniciar sesion de nuevo a menos que el token expire o elimines el servidor de tu cliente de IA.

### Que hace OAuth

OAuth permite al cliente de IA actuar en tu nombre sin ver nunca tu contrasena. Tu inicias sesion directamente con ITM Platform, y el servidor emite un token con alcance limitado. Para desconectarte, elimina el servidor de tu cliente de IA (consulta [Desconectar y auditoria](#revoke-and-audit)).

### Alcances (scopes)

Tu token OAuth determina que puede hacer la IA:

| Alcance | Que permite |
|---------|-------------|
| `mcp:read` | Buscar proyectos, ver presupuestos, listar tareas, consultar el portafolio |
| `mcp:write` | Todo lo anterior, mas crear tareas, registrar riesgos/incidencias, actualizar proyectos |
