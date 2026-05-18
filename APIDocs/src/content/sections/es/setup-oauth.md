### Como funciona

Con la configuracion alojada, tu cliente de IA se conecta al servidor MCP de ITM Platform por internet. La primera vez que te conectes, se abre una ventana del navegador pidiendote que inicies sesion en ITM Platform y autorices el cliente de IA.

### Paso 1: Agrega la URL del servidor

En la configuracion MCP de tu cliente de IA, agrega el servidor alojado:

```json
{
  "mcpServers": {
    "itm-platform": {
      "type": "http",
      "url": "https://mcp.itmplatform.com/mcp"
    }
  }
}
```

### Paso 2: Autoriza

Cuando uses la conexion por primera vez, tu cliente de IA abrira una ventana del navegador. Inicia sesion con tus credenciales de ITM Platform y haz clic en **Autorizar**. El cliente de IA recibe un token que le permite actuar en tu nombre.

### Paso 3: Empieza a usarlo

Hazle una pregunta a la IA sobre tus proyectos. La autorizacion se recuerda: no necesitaras iniciar sesion de nuevo a menos que revoques el acceso.

### Que hace OAuth

OAuth permite al cliente de IA actuar en tu nombre sin ver nunca tu contrasena. Tu inicias sesion directamente con ITM Platform, y el servidor emite un token con alcance limitado. Puedes revocar este token en cualquier momento (consulta la seccion "Revocar acceso").
