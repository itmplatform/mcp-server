### ¿Se envían mis datos a la empresa de IA?

El servidor MCP funciona entre su cliente de IA e ITM Platform. Los datos de sus proyectos pasan por el servidor MCP hacia el cliente de IA. El proveedor de IA (Anthropic, OpenAI, etc.) procesa los datos según su propia política de tratamiento de datos. ITM Platform no envía sus datos a ningún proveedor de IA de forma independiente: los datos solo fluyen cuando hace una pregunta a través de su cliente de IA.

### ¿Puede la IA modificar mis proyectos?

Sí, si tiene la licencia adecuada y ha otorgado permisos de escritura. Los Company Admins y Full Users tienen acceso completo; los Project Managers solo pueden modificar los proyectos que gestionan. La IA puede crear tareas, actualizar proyectos y registrar riesgos e incidencias. Para detener el acceso, elimine el servidor MCP de su cliente de IA (consulte [Desconectar](#revoke-and-audit)).

### ¿Qué clientes de IA son compatibles?

Claude Code, Claude Desktop, VS Code (Copilot), Cursor, OpenAI Codex, Windsurf y JetBrains AI Assistant. Cualquier cliente compatible con MCP puede conectarse usando la configuración estándar.

### ¿Necesito instalar algo?

Para configuración local: necesita Node.js instalado (el comando `npx` se encarga del resto). Para configuración alojada: nada que instalar, solo agregue la URL del servidor a su cliente de IA.

### ¿Qué pasa si cambio mi contraseña?

Las claves API no se ven afectadas por cambios de contraseña. Los tokens OAuth siguen siendo válidos hasta que expiren. No necesita reconfigurar su cliente de IA después de un cambio de contraseña.

### ¿Pueden varios usuarios conectarse al mismo tiempo?

Sí. Cada usuario se autentica de forma independiente con su propia clave API o token OAuth. El servidor MCP resuelve la identidad y los permisos de cada usuario por separado.

### ¿Dónde puedo encontrar más ayuda?

- Para preguntas sobre ITM Platform: [helpcenter.itmplatform.com](https://helpcenter.itmplatform.com)
- Para acceso REST API sin asistente de IA: [developers.itmplatform.com/documentation](https://developers.itmplatform.com/documentation)
- Para consultas DataMart (GraphQL): [developers.itmplatform.com/datamart](https://developers.itmplatform.com/datamart)
