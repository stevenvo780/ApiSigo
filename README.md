# ApiSigo

Servicio de facturación e integración SIGO (Colombia) usado por Hub Central.

## Características

- Gestión de clientes (crear, listar, buscar, actualizar, activar/desactivar)
- Facturación: crear, enviar/reintentar, estado, anulación
- Webhooks de orden desde HubCentral/Graf con verificación HMAC (`X-Hub-Signature-256`)
- Validación, rate limiting, CORS y manejo de errores

## Instalación y uso

```bash
cd ApiSigo
npm install
cp .env.example .env   # configura credenciales SIGO y secretos

# Desarrollo
npm run dev

# Producción
npm run build && npm start
```

Puerto por defecto: `3004` (configurable vía `PORT`).

## Configuración (.env)

Variables principales (ver `.env.example`):
- `SIGO_API_URL`, `SIGO_API_KEY`, `SIGO_USERNAME`, `SIGO_PASSWORD`
- `APISIGO_WEBHOOK_SECRET` o `HUB_WEBHOOK_SECRET` para HMAC
- `ALLOWED_ORIGINS` para CORS (opcional)

## Endpoints

Base: `http://localhost:3004`

### Clientes
- `POST /api/clients` → Crear cliente
- `GET /api/clients` → Listar con paginación
- `GET /api/clients/search` → Buscar por término
- `GET /api/clients/validate` → Validar documento
- `GET /api/clients/health` → Health del módulo
- `GET /api/clients/:tipoDocumento/:numeroDocumento` → Obtener
- `PUT /api/clients/:tipoDocumento/:numeroDocumento` → Actualizar
- `DELETE /api/clients/:tipoDocumento/:numeroDocumento` → Eliminar
- `PATCH /api/clients/:tipoDocumento/:numeroDocumento/toggle-status` → Activar/Desactivar

### Facturas
- `POST /api/invoices` → Crear factura
- `GET /api/invoices` → Listar con paginación
- `GET /api/invoices/health` → Health del módulo
- `GET /api/invoices/:serie/:numero` → Obtener
- `PUT /api/invoices/:serie/:numero/status` → Actualizar estado
- `GET /api/invoices/:serie/:numero/status` → Estado actual
- `POST /api/invoices/:serie/:numero/send` → Enviar a DIAN/SUNAT según país
- `POST /api/invoices/:serie/:numero/resend` → Reenviar
- `POST /api/invoices/:serie/:numero/cancel` → Anular

### Webhooks
- `POST /api/webhooks/order` → Procesar orden
  - Headers: `X-Hub-Signature-256: sha256=<hex>`, opcional `X-API-KEY`
  - El cuerpo debe firmarse con HMAC‑SHA256 usando `APISIGO_WEBHOOK_SECRET` (o `HUB_WEBHOOK_SECRET`)
- `POST /api/webhooks/retry` → Reintentar webhook fallido
- `GET /api/webhooks/pending` → Listar pendientes
- `GET /api/webhooks/:webhookId/status` → Estado
- `GET /api/webhooks/health` → Health del módulo

## Estados de Factura (referencia)

- `PENDIENTE` → creada
- `ENVIADO` → enviada a autoridad fiscal (DIAN/SUNAT)
- `ACEPTADO` | `APROBADO` → aceptada
- `RECHAZADO` → rechazada
- `ANULADO` → anulada

## Respuestas tipo

Éxito
```json
{ "success": true, "message": "OK", "data": { } }
```

Error
```json
{ "error": "BadRequest", "message": "Descripción", "details": { } }
```

## Health

- `GET /health` → estado del servicio
- `GET /api` → metadatos y rutas disponibles

Documentación JSON rápida: `GET /api/docs`
