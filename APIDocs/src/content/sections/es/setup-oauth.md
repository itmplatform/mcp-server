Esta es la forma más rápida de empezar. Su cliente de IA se conecta al servidor MCP de ITM Platform por internet. Sin instalación, sin claves API -- solo una URL y su inicio de sesión de ITM Platform.

Si prefiere ejecutar el servidor localmente, consulte [Conectar con clave API](#setup-stdio).

### Paso 1: Agregue la URL del servidor

En la configuración MCP de su cliente de IA, agregue la URL del servidor:

```
https://api.itmplatform.com/v2/_/mcp/
```

El formato exacto varía según el cliente. Consulte [Configuración por cliente de IA](#ai-clients) para instrucciones paso a paso para Claude, VS Code, Cursor, Codex, Windsurf y otros.

### Paso 2: Abra MCP y autorice

Después de agregar el servidor, abra su cliente de IA y escriba `/mcp` donde se admitan comandos con barra. Seleccione `itm-platform`; el cliente abrirá una ventana del navegador para que inicie sesión con sus credenciales de ITM Platform y conceda el acceso. El cliente de IA recibe un token que le permite actuar en su nombre.

### Paso 3: Empiece a preguntar

Hágale una pregunta a la IA sobre sus proyectos. La autorización se recuerda -- no necesitará iniciar sesión de nuevo a menos que el token expire o elimine el servidor de su cliente de IA.

### Qué hace OAuth

OAuth permite al cliente de IA actuar en su nombre sin ver nunca su contraseña. Usted inicia sesión directamente con ITM Platform, y el servidor emite un token con alcance limitado. Para desconectarse, elimine el servidor de su cliente de IA (consulte [Desconectar](#revoke-and-audit)).

### Alcances (scopes)

Su token OAuth determina qué puede hacer la IA:

| Alcance | Qué permite |
|---------|-------------|
| `mcp:read` | Buscar proyectos, ver presupuestos, listar tareas, consultar el portafolio |
| `mcp:write` | Todo lo anterior, más crear y actualizar proyectos, servicios, tareas, actividades, riesgos e incidencias |
