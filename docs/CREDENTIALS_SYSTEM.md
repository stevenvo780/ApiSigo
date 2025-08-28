# Sistema de Credenciales Mediante Headers

## Resumen

El API ha sido refactorizado para recibir las credenciales de SIGO mediante headers HTTP en lugar de configuración estática. Esto permite un diseño serverless-friendly con soporte multi-tenant.

## Cambios Principales

### 1. Middleware de Credenciales (`src/middleware/sigoCredentials.ts`)

- **Extrae credenciales de headers**: `x-sigo-email` y `x-sigo-apikey`
- **Valida presencia**: Respuesta 401 si faltan credenciales
- **Inyecta en request**: Añade `sigoCredentials` al objeto request

### 2. Cache de Autenticación (`src/shared/authCache.ts`)

- **Cache en memoria**: Tokens por email/apiKey (50 minutos TTL)
- **Serverless-friendly**: Se reinicia con cada container, evita estado persistente
- **Multi-tenant**: Soporte para múltiples cuentas SIGO simultáneamente

### 3. Servicios Refactorizados

#### InvoiceService (`src/modules/invoices/service.ts`)
- **Método `ensureAuth(credentials)`**: Verifica cache o autentica
- **Método `authenticate(credentials)`**: Obtiene token y lo cachea
- **Parámetro credentials**: Todos los métodos públicos requieren credenciales

#### ClientService (`src/modules/clients/service.ts`)
- **Mismo patrón**: Cache + autenticación bajo demanda
- **API compatible**: Mantiene interfaz similar

### 4. Controladores Actualizados

- **Verificación de credenciales**: Valida `req.sigoCredentials` existe
- **Pasa credenciales a servicios**: Todos los métodos reciben credenciales
- **Respuestas 401**: Si middleware no ejecutó correctamente

### 5. Rutas con Middleware

Todas las rutas ahora incluyen `extractSigoCredentials`:

```typescript
router.post("/", extractSigoCredentials, validateInvoice, createInvoice);
router.post("/webhook", extractSigoCredentials, async (req, res) => {
  // webhook logic with credentials
});
```

## Uso del API

### Headers Requeridos

```bash
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -H "x-sigo-email: usuario@empresa.com" \
  -H "x-sigo-apikey: tu_api_key_sigo" \
  -d '{
    "serie": "FV01",
    "cliente": {
      "razonSocial": "Cliente Test"
    },
    "items": [
      {
        "descripcion": "Producto Test",
        "cantidad": 1,
        "precioUnitario": 100
      }
    ]
  }'
```

### Respuesta de Error (Sin Credenciales)

```json
{
  "error": "Credenciales SIGO requeridas",
  "message": "Debe proporcionar x-sigo-email y x-sigo-apikey en los headers",
  "headers_required": {
    "x-sigo-email": "Email de usuario SIGO",
    "x-sigo-apikey": "API Key de SIGO"
  }
}
```

## Beneficios

### 1. **Serverless Ready**
- Sin estado persistente entre requests
- Cache en memoria efímero (apropiado para containers)
- Escalado horizontal sin problemas

### 2. **Multi-Tenant**
- Múltiples clientes pueden usar el mismo API
- Credenciales aisladas por request
- Cache separado por cuenta

### 3. **Seguridad**
- Credenciales no hardcodeadas
- Rotación de credenciales sin redeploy
- Aislamiento entre tenants

### 4. **Observabilidad**
- Logs con email del usuario (sin credenciales sensibles)
- Métricas de autenticación por cuenta
- Debugging más fácil en multi-tenant

## Arquitectura

```
Request → extractSigoCredentials → Controller → Service → AuthCache → SIGO API
   ↓              ↓                    ↓           ↓          ↓
Headers      Validation           req.sigoCredentials   Token Cache   Auth
```

## Migración

### Antes (Config-based)
```typescript
// En config
const credentials = {
  username: process.env.SIGO_USERNAME,
  password: process.env.SIGO_PASSWORD
}

// En service
await this.authenticate(); // credenciales desde config
```

### Después (Header-based)
```typescript
// En headers HTTP
x-sigo-email: usuario@empresa.com
x-sigo-apikey: api_key

// En service
await this.authenticate(credentials); // credenciales desde request
```

## Compatibilidad con Webhooks

Los webhooks también requieren credenciales:

```bash
curl -X POST http://localhost:3000/api/invoices/webhook \
  -H "Content-Type: application/json" \
  -H "x-sigo-email: webhook@empresa.com" \
  -H "x-sigo-apikey: webhook_api_key" \
  -H "x-hub-signature: sha256=..." \
  -d '{
    "event_type": "pedido.pagado",
    "data": {
      "order_id": "12345",
      "amount": 10000,
      "items": [...]
    }
  }'
```

## Próximos Pasos

1. **Monitoring**: Métricas de cache hit/miss por tenant
2. **Rate Limiting**: Límites por apiKey/email
3. **Token Refresh**: Renovación automática antes de expiración
4. **Health Checks**: Validación de credenciales en health endpoint
