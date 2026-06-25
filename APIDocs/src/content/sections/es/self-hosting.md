Esta sección es para equipos que quieren ejecutar el servidor MCP en su propia infraestructura, ya sea como proceso local para usuarios individuales o como servicio HTTP compartido detrás de OAuth.

### Requisitos previos

- Node.js 20 o posterior
- Una cuenta de ITM Platform con licencia Company Admin, Full User o Project Manager
- Una clave API generada desde la configuración de usuario de ITM Platform (para modo stdio)

### Instalar desde npm

```bash
npm install -g @itm-platform/mcp-server
```

O ejecutar sin instalar:

```bash
npx @itm-platform/mcp-server
```

### Compilar desde el código fuente

```bash
git clone https://github.com/niceTech/ITM.MCP.git  # placeholder -- actualizar con la URL real del repositorio
cd ITM.MCP
npm install
npm run build
```

### Configuración

Cree un archivo `.env` en la raíz del proyecto. Las variables necesarias dependen del modo de transporte:

**Modo stdio** (local, un solo usuario):
```
ITM_API_URL=https://api.itmplatform.com
ITM_COMPANY={su-cuenta}
ITM_API_KEY=su-clave-api
LOG_LEVEL=info
```

**Modo HTTP + OAuth** (desplegado, multi-tenant):
```
ITM_API_URL=http://localhost/ITM.API
PORT=6170
ITM_AUTH_URL=http://localhost/ITM.API
ITM_AUTH_PUBLIC_URL=https://api.itmplatform.com
MCP_SERVER_URL=https://api.itmplatform.com/v2/_/mcp/
LOG_LEVEL=info
ITM_AUDIT_ENABLED=true
```

### Referencia de variables de entorno

| Variable | Stdio | HTTP+OAuth | Descripción |
|----------|-------|------------|-------------|
| `ITM_API_URL` | Requerido | Requerido | URL del gateway de la API de ITM Platform |
| `ITM_COMPANY` | Requerido | -- | Slug de su empresa/tenant |
| `ITM_API_KEY` | Requerido* | -- | Su clave API personal (*o use `ITM_TOKEN`) |
| `ITM_TOKEN` | Requerido* | -- | Token de sesión (*alternativa a la clave API) |
| `PORT` | -- | Requerido | Puerto del servidor HTTP |
| `ITM_AUTH_URL` | -- | Requerido | URL interna del servidor de autorización OAuth (intercambio de token) |
| `ITM_AUTH_PUBLIC_URL` | -- | Requerido* | URL pública de OAuth para descubrimiento por clientes de IA. Usa `ITM_AUTH_URL` como respaldo |
| `MCP_SERVER_URL` | -- | Requerido | URL pública del servidor MCP (audiencia OAuth) |
| `LOG_LEVEL` | Opcional | Opcional | Nivel de log de Pino: `debug`, `info`, `warn`, `error` (por defecto: `info`) |
| `ITM_AUDIT_ENABLED` | Opcional | Opcional | Habilitar registro de auditoría hacia el backend de ITM |

En modo HTTP, cuando tanto `ITM_AUTH_URL` como `MCP_SERVER_URL` están configurados, OAuth es obligatorio y cada sesión debe proporcionar un token Bearer. `ITM_COMPANY` e `ITM_API_KEY` no son necesarios en este modo.

Cuando se despliega detrás de un proxy inverso, `ITM_AUTH_URL` puede apuntar a `localhost` para el intercambio interno de tokens. Configure `ITM_AUTH_PUBLIC_URL` con la URL que los clientes de IA pueden alcanzar desde internet.

### Ejecutar el servidor

**Modo stdio** (para clientes de IA que inician un proceso local):
```bash
node dist/server.js
```

**Modo HTTP** (para desarrollo o despliegue auto-alojado):
```bash
npm run dev
```

Esto inicia el servidor en el puerto configurado (por defecto 6170) con recarga automática.

### Despliegue en producción

Para producción, compile y ejecute la salida compilada:

```bash
npm run build
node dist/server.js
```

El transporte HTTP se usa cuando la variable de entorno `PORT` está configurada o cuando el servidor detecta que no fue iniciado por un cliente MCP.
