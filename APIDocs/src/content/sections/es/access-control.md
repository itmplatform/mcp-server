El acceso a las herramientas MCP depende de su tipo de licencia de ITM Platform. El servidor MCP aplica los mismos permisos que la aplicación web de ITM Platform.

### Tipos de licencia

| Licencia | Acceso de lectura | Acceso de escritura | Notas |
|----------|-------------------|---------------------|-------|
| **Company Admin** | Completo | Completo | Puede ver y modificar todos los proyectos, servicios y usuarios |
| **Full User** | Completo | Completo | Mismo acceso a datos que Company Admin |
| **Project Manager** | Limitado | Limitado | Solo puede ver y modificar los proyectos que gestiona |
| **Team Member** | Bloqueado | Bloqueado | No puede usar herramientas MCP |

### Cómo funciona

Cuando conecta su cliente de IA, el servidor MCP resuelve su identidad usando su clave API o token OAuth. Su tipo de licencia determina a qué proyectos y datos puede acceder la IA. La IA nunca ve datos que usted no podría ver en la aplicación web de ITM Platform.

### Permisos a nivel de proyecto

Los Company Admins y Full Users pueden acceder a todos los proyectos. Los Project Managers solo pueden acceder a los proyectos que gestionan.
