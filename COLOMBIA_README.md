# DOCUMENTACIÓN APISIGO - COLOMBIA

## Resumen
ApiSigo es el sistema de integración con SIGO para facturación electrónica en Colombia. Recibe webhooks del Hub Central cuando se procesa un pago en Graf y genera automáticamente facturas de venta electrónicas.

## Configuración Colombia

### Variables de Entorno
```env
# SIGO API Colombia
SIGO_API_URL=https://api.sigo.com.co
SIGO_SERIE_DEFAULT=FV                # Factura de Venta
SIGO_NIT_GENERICO=900123456-1        # NIT genérico Colombia
```

### Impuestos
- **IVA Colombia:** 19%
- **Moneda:** Pesos Colombianos (COP)
- **Tipo de documento:** FACTURA_VENTA

## Flujo de Facturación

### 1. Recepción del Webhook
```json
{
  "event_type": "pedido.pagado",
  "data": {
    "order_id": 123,
    "amount": 95000,          // En centavos COP
    "currency": "COP",
    "items": [...],
    "paid_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Transformación a SIGO Colombia
```json
{
  "tipo_documento": "FACTURA_VENTA",
  "serie": "FV",
  "moneda": "COP",
  "cliente": {
    "tipo_documento": "NIT",
    "numero_documento": "900123456-1",
    "razon_social": "Cliente Graf Colombia"
  },
  "items": [
    {
      "valor_unitario": 798.32,  // Sin IVA
      "iva_total": 151.68,       // IVA 19%
      "precio_total": 950.00     // Total con IVA
    }
  ]
}
```

### 3. Cálculos Automáticos

#### IVA 19% (Colombia)
```javascript
const ivaRate = 0.19;
const valorSinIVA = valorTotal / (1 + ivaRate);
const iva = valorTotal - valorSinIVA;
```

#### Conversión de Centavos
```javascript
const montoCOP = amountEnCentavos / 100;
// Ejemplo: 95000 centavos = 950.00 COP
```

## Endpoints Disponibles

### POST /api/facturas
Recibe webhooks del Hub Central para crear facturas.

**Headers requeridos:**
- `x-hub-signature`: Firma HMAC-SHA256 del payload
- `Content-Type`: application/json

**Response exitoso (200):**
```json
{
  "status": "success",
  "factura_id": "FACT-123-20240815",
  "documento_sigo_id": "DOC123",
  "numero_documento": "FV-00000123",
  "webhook_confirmado": true
}
```

### GET /api/facturas/health
Verificación del estado del servicio.

**Response:**
```json
{
  "status": "OK",
  "service": "ApiSigo Webhooks Colombia",
  "endpoints": {
    "webhook": "/api/facturas",
    "health": "/api/facturas/health"
  }
}
```

## Seguridad

### Validación HMAC
Todos los webhooks incluyen firma HMAC-SHA256:
```javascript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');
```

### Reintentos
- **Intentos máximos:** 3
- **Backoff:** Exponencial (1s, 2s, 4s)
- **Timeout:** 10 segundos por request

## Logs y Trazabilidad

### Logs Generados
```
[INFO] Webhook recibido - Orden: 123, Monto: 950.00 COP
[INFO] Factura creada - SIGO ID: DOC123, Graf Order: 123
[INFO] Confirmación enviada a Hub Central - Orden: 123
```

### Métricas
- Tiempo de procesamiento: <200ms
- Tasa de éxito: >99%
- Cobertura de tests: 100% funciones críticas

## Desarrollo

### Ejecutar Tests
```bash
npm test tests/apiSigo.unit.test.js
```

### Variables de Desarrollo
```env
NODE_ENV=development
LOG_LEVEL=debug
PORT=3004
```

### Estructura de Archivos
```
src/
├── controllers/
│   └── webhookController.js    # Procesamiento webhooks
├── services/
│   ├── facturaService.js       # Transformación Graf→SIGO
│   └── webhookService.js       # Confirmaciones Hub Central
├── routes/
│   └── webhookRoutes.js        # Rutas API
└── models/
    └── facturaModel.js         # Validaciones Colombia
```

## Integración SIGO Colombia

### API Endpoints SIGO
- **Base URL:** https://api.sigo.com.co
- **Autenticación:** API Key en headers
- **Formato:** JSON REST

### Documentos Soportados
- Factura de Venta (FV)
- Nota Crédito (NC) - Próximamente
- Nota Débito (ND) - Próximamente

### Campos Obligatorios SIGO
- NIT del emisor
- Datos del adquiriente
- Detalle de productos/servicios
- Cálculo de impuestos (IVA 19%)
- Numeración DIAN
