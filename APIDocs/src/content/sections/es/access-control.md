El acceso a las herramientas MCP depende de tu tipo de licencia de ITM Platform. El servidor MCP aplica los mismos permisos que la aplicacion web de ITM Platform.

### Tipos de licencia

| Licencia | Acceso de lectura | Acceso de escritura | Notas |
|----------|-------------------|---------------------|-------|
| **Company Admin** | Completo | Completo | Puede ver y modificar todos los proyectos, servicios y usuarios |
| **Full User** | Completo | Completo | Mismo acceso a datos que Company Admin |
| **Project Manager** | Limitado | Limitado | Solo puede ver y modificar proyectos donde esta asignado como manager |
| **Team Member** | Bloqueado | Bloqueado | No puede usar herramientas MCP (error 403) |

### Como funciona

Cuando conectas tu cliente de IA, el servidor MCP resuelve tu identidad usando tu clave API o token OAuth. Tu tipo de licencia determina a que proyectos y datos puede acceder la IA. La IA nunca ve datos que tu no podrias ver en la aplicacion web de ITM Platform.

### Permisos a nivel de proyecto

Los Project Managers solo pueden acceder a proyectos donde estan asignados como manager. Si le preguntas a la IA sobre un proyecto que no gestionas, el servidor devuelve un resultado vacio: la IA te dira que no pudo encontrar ese proyecto.
