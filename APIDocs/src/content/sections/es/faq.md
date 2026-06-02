### Se envian mis datos a la empresa de IA?

El servidor MCP funciona entre tu cliente de IA e ITM Platform. Los datos de tus proyectos pasan por el servidor MCP hacia el cliente de IA. El proveedor de IA (Anthropic, OpenAI, etc.) procesa los datos segun su propia politica de tratamiento de datos. ITM Platform no envia tus datos a ningun proveedor de IA de forma independiente: los datos solo fluyen cuando haces una pregunta a traves de tu cliente de IA.

### Puede la IA modificar mis proyectos?

Si, si tienes la licencia adecuada (Company Admin o Full User) y has otorgado permisos de escritura. La IA puede crear tareas, actualizar proyectos y registrar riesgos e incidencias. Para detener el acceso, elimina el servidor MCP de tu cliente de IA (consulta [Desconectar y auditoria](#revoke-and-audit)).

### Que clientes de IA son compatibles?

Claude Code, Claude Desktop, VS Code (Copilot), Cursor, OpenAI Codex, Windsurf y JetBrains AI Assistant. Cualquier cliente compatible con MCP puede conectarse usando la configuracion estandar.

### Necesito instalar algo?

Para configuracion local: necesitas Node.js instalado (el comando `npx` se encarga del resto). Para configuracion alojada: nada que instalar, solo agrega la URL del servidor a tu cliente de IA.

### Que pasa si cambio mi contrasena?

Las claves API no se ven afectadas por cambios de contrasena. Los tokens OAuth siguen siendo validos hasta que expiren. No necesitas reconfigurar tu cliente de IA despues de un cambio de contrasena.

### Pueden varios usuarios conectarse al mismo tiempo?

Si. Cada usuario se autentica de forma independiente con su propia clave API o token OAuth. El servidor MCP resuelve la identidad y los permisos de cada usuario por separado.

### Donde puedo encontrar mas ayuda?

- Para preguntas sobre ITM Platform: [helpcenter.itmplatform.com](https://helpcenter.itmplatform.com)
- Para acceso REST API sin asistente de IA: [developers.itmplatform.com/documentation](https://developers.itmplatform.com/documentation)
- Para consultas DataMart (GraphQL): [developers.itmplatform.com/datamart](https://developers.itmplatform.com/datamart)
