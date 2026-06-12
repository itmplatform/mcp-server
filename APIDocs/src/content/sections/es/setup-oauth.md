Esta es la forma mas rapida de empezar. Su cliente de IA se conecta al servidor MCP de ITM Platform por internet. Sin instalacion, sin claves API -- solo una URL y su inicio de sesion de ITM Platform.

Si prefiere ejecutar el servidor localmente, consulte [Conectar con clave API](#setup-stdio).

### Paso 1: Agregue la URL del servidor

En la configuracion MCP de su cliente de IA, agregue la URL del servidor:

```
https://api.itmplatform.com/v2/_/mcp/
```

El formato exacto varia segun el cliente. Consulte [Configuracion por cliente de IA](#ai-clients) para instrucciones paso a paso para Claude, VS Code, Cursor, Codex, Windsurf y otros.

### Paso 2: Abra MCP y autorice

Despues de agregar el servidor, abra su cliente de IA y escriba `/mcp` donde se admitan comandos con barra. Seleccione `itm-platform`; el cliente abrira una ventana del navegador para que inicie sesion con sus credenciales de ITM Platform y conceda el acceso. El cliente de IA recibe un token que le permite actuar en su nombre.

### Paso 3: Empiece a preguntar

Hagale una pregunta a la IA sobre sus proyectos. La autorizacion se recuerda -- no necesitara iniciar sesion de nuevo a menos que el token expire o elimine el servidor de su cliente de IA.

### Que hace OAuth

OAuth permite al cliente de IA actuar en su nombre sin ver nunca su contrasena. Usted inicia sesion directamente con ITM Platform, y el servidor emite un token con alcance limitado. Para desconectarse, elimine el servidor de su cliente de IA (consulte [Desconectar y auditoria](#revoke-and-audit)).

### Alcances (scopes)

Su token OAuth determina que puede hacer la IA:

| Alcance | Que permite |
|---------|-------------|
| `mcp:read` | Buscar proyectos, ver presupuestos, listar tareas, consultar el portafolio |
| `mcp:write` | Todo lo anterior, mas crear tareas, registrar riesgos/incidencias, actualizar proyectos |
