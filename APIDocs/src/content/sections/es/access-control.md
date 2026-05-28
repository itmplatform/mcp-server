El acceso a las herramientas MCP depende de tu tipo de licencia de ITM Platform. El servidor MCP aplica los mismos permisos que la aplicacion web de ITM Platform.

### Tipos de licencia

| Licencia | Acceso de lectura | Acceso de escritura | Notas |
|----------|-------------------|---------------------|-------|
| **Company Admin** | Completo | Completo | Puede ver y modificar todos los proyectos, servicios y usuarios |
| **Full User** | Completo | Completo | Mismo acceso a datos que Company Admin |
| **Project Manager** | Aun no disponible | Aun no disponible | El acceso limitado para Project Managers esta previsto para una version futura |
| **Team Member** | Bloqueado | Bloqueado | No puede usar herramientas MCP |

### Como funciona

Cuando conectas tu cliente de IA, el servidor MCP resuelve tu identidad usando tu clave API o token OAuth. Tu tipo de licencia determina a que proyectos y datos puede acceder la IA. La IA nunca ve datos que tu no podrias ver en la aplicacion web de ITM Platform.

### Permisos a nivel de proyecto

Los Company Admins y Full Users pueden acceder a todos los proyectos. El acceso limitado para Project Managers (restringido a proyectos asignados) esta previsto para una version futura.
