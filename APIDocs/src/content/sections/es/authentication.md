### Autenticación con clave API (solo modo stdio)

Para uso local mediante transporte stdio (clientes de IA que inician el servidor como proceso hijo). Genere una clave API en la configuración de usuario de ITM Platform y pásela como variable de entorno:

```
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY=su-cuenta
ITM_API_KEY=su-clave-api
```

Al iniciar, el servidor llama al endpoint de resolución de identidad (`/resolve/identity`) para verificar la clave y determinar el tipo de licencia del usuario. Si la clave es inválida o la cuenta de usuario está deshabilitada, el servidor no arranca.

Las claves API proporcionan acceso completo (lectura + escritura) según el tipo de licencia del usuario. No hay restricción de alcance -- la clave representa los permisos completos del usuario.

La autenticación con clave API no está disponible en modo HTTP+OAuth. Cuando se despliega con OAuth, `ITM_COMPANY` e `ITM_API_KEY` no son necesarios -- cada sesión se autentica mediante intercambio de token OAuth.

### Autenticación OAuth 2.1

El servidor alojado usa OAuth 2.1 con el flujo de código de autorización (con PKCE). Se utiliza cuando los clientes de IA se conectan al servidor por HTTP.

```
Cliente de IA              Servidor MCP                ITM Platform
    |                          |                            |
    |-- GET /.well-known/ ---->|                            |
    |<-- metadatos servidor ---|                            |
    |                          |                            |
    |-- GET /authorize ------->|                            |
    |<------ redirección ------|                            |
    |                          |                            |
    |-- login navegador -------|--------------------------->|
    |<-- código autorización --|<---------------------------|
    |                          |                            |
    |-- POST /token ---------->|                            |
    |<-- access_token ---------|                            |
```

### Intercambio de token

El código de autorización se intercambia por un token de acceso mediante el endpoint `/token`. El token incluye:

- `sub`: El ID del usuario
- `scope`: `mcp:read` o `mcp:read mcp:write`
- `exp`: Tiempo de expiración del token

### Aplicación de alcances

| Alcance | Operaciones permitidas |
|---------|------------------------|
| `mcp:read` | Todas las herramientas de lectura (search, get, list, aggregate, query) |
| `mcp:write` | Todas las herramientas de lectura + herramientas de escritura (create, update) |

Las herramientas de escritura verifican el alcance `mcp:write` en cada llamada. Si el token solo tiene `mcp:read`, las operaciones de escritura devuelven un error 403.

Las sesiones con clave API no tienen restricciones de alcance -- usan los permisos completos del tipo de licencia del usuario.

### Metadatos del servidor

El servidor MCP publica sus metadatos de recurso en `/.well-known/oauth-protected-resource`. Esto indica a los clientes de IA qué servidor de autorización usar y qué alcances están disponibles. El cliente de IA luego obtiene los metadatos del servidor de autorización para descubrir los endpoints de autorización y token.
