### El servidor no arranca

**"Identity resolution timeout"** -- El servidor llama a ITM Platform al iniciar para verificar sus credenciales. Si no puede conectarse a la API:

- Verifique que `ITM_API_URL` es correcto y accesible
- Verifique que `ITM_COMPANY` coincide exactamente con el slug de su cuenta
- Verifique que su clave API es valida (intente generar una nueva)
- Verifique su conexion de red y la configuracion del firewall

**"Invalid API key"** -- La clave API fue rechazada. Genere una nueva en la configuracion de usuario de ITM Platform.

### Las herramientas no aparecen en el cliente de IA

- Asegurese de que el servidor MCP se inicio correctamente (busque el mensaje "MCP server connected" en la salida de error)
- Verifique que la ruta y formato de configuracion coinciden con lo que espera su cliente de IA
- Para modo stdio: compruebe que `npx @itm-platform/mcp-server` se ejecuta correctamente en su terminal
- Para modo HTTP: compruebe que la URL es correcta y el servidor esta escuchando en el puerto esperado
- Reinicie su cliente de IA despues de cambiar la configuracion

### Errores de OAuth

**"Authorization failed"** -- El usuario cancelo el flujo de autorizacion o la sesion expiro. Intente conectarse de nuevo.

**"Insufficient scope"** -- Necesita el alcance `mcp:write` para operaciones de escritura. Vuelva a autorizar y asegurese de conceder permisos de escritura cuando se le solicite.

**"Token expired"** -- Reconecte su cliente de IA. El flujo de autorizacion emitira un nuevo token.

### Desfase de DataMart despues de escrituras

Despues de crear o actualizar un registro mediante una herramienta de escritura, los resultados de busqueda pueden mostrar datos desactualizados durante hasta 60 segundos. Este es el comportamiento esperado -- DataMart es una replica de lectura con consistencia eventual. La confirmacion de escritura proviene de la API REST v2 (fuente de verdad) y siempre es precisa.

### "Permission denied" (403)

Su licencia de ITM Platform no permite acceso MCP. Los Team Members y Project Guests no pueden usar herramientas MCP. Contacte a su Company Admin para actualizar su licencia.

### Conexion rechazada / timeout

- Para stdio: asegurese de que Node.js esta instalado y `npx` esta en su PATH
- Para HTTP: asegurese de que el servidor esta en ejecucion y el puerto no esta bloqueado
- Compruebe que ningun otro proceso esta usando el mismo puerto
