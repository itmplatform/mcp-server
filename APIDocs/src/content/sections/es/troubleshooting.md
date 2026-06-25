### El servidor no arranca

**"Identity resolution timeout"** -- El servidor llama a ITM Platform al iniciar para verificar sus credenciales. Si no puede conectarse a la API:

- Verifique que `ITM_API_URL` es correcto y accesible
- Verifique que `ITM_COMPANY` coincide exactamente con el slug de su cuenta
- Verifique que su clave API es válida (intente generar una nueva)
- Verifique su conexión de red y la configuración del firewall

**"Invalid API key"** -- La clave API fue rechazada. Genere una nueva en la configuración de usuario de ITM Platform.

### Las herramientas no aparecen en el cliente de IA

- Asegúrese de que el servidor MCP se inició correctamente (busque el mensaje "MCP server connected" en la salida de error)
- Verifique que la ruta y formato de configuración coinciden con lo que espera su cliente de IA
- Para modo stdio: compruebe que `npx @itm-platform/mcp-server` se ejecuta correctamente en su terminal
- Para modo HTTP: compruebe que la URL es correcta y el servidor está escuchando en el puerto esperado
- Reinicie su cliente de IA después de cambiar la configuración

### Errores de OAuth

**"Authorization failed"** -- El usuario canceló el flujo de autorización o la sesión expiró. Intente conectarse de nuevo.

**"Insufficient scope"** -- Necesita el alcance `mcp:write` para operaciones de escritura. Vuelva a autorizar y asegúrese de conceder permisos de escritura cuando se le solicite.

**"Token expired"** -- Reconecte su cliente de IA. El flujo de autorización emitirá un nuevo token.

### Desfase de DataMart después de escrituras

Después de crear o actualizar un registro mediante una herramienta de escritura, los resultados de búsqueda pueden mostrar datos desactualizados durante hasta 60 segundos. Este es el comportamiento esperado -- DataMart es una réplica de lectura con consistencia eventual. La confirmación de escritura proviene de la API REST v2 (fuente de verdad) y siempre es precisa.

### "Permission denied" (403)

Su licencia de ITM Platform no permite acceso MCP. Los Team Members y Project Guests no pueden usar herramientas MCP. Contacte a su Company Admin para actualizar su licencia.

### Conexión rechazada / timeout

- Para stdio: asegúrese de que Node.js está instalado y `npx` está en su PATH
- Para HTTP: asegúrese de que el servidor está en ejecución y el puerto no está bloqueado
- Compruebe que ningún otro proceso está usando el mismo puerto
