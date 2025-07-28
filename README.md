# API SIGO

API para conectar con SIGO - Sistema de facturación electrónica y gestión de clientes.

## Características

- ✅ Gestión de clientes (crear, obtener, actualizar)
- ✅ Creación y gestión de facturas
- ✅ Cambio de estados de facturas
- ✅ Envío de facturas a SUNAT
- ✅ Anulación de facturas
- ✅ Validación de datos
- ✅ Manejo de errores
- ✅ Rate limiting
- ✅ Seguridad con Helmet

## Instalación

```bash
npm install
```

## Configuración

1. Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```

2. Configura las variables de entorno en `.env`:
```
PORT=3000
SIGO_API_URL=https://api.sigo.com
SIGO_API_KEY=tu_api_key_de_sigo
SIGO_USERNAME=tu_usuario_sigo
SIGO_PASSWORD=tu_password_sigo
```

## Uso

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm start
```

## Endpoints

### Clientes

#### Crear Cliente
```http
POST /api/clients
Content-Type: application/json

{
  "razonSocial": "EMPRESA EJEMPLO SAC",
  "ruc": "20123456789",
  "direccion": "Av. Ejemplo 123, Lima",
  "email": "contacto@ejemplo.com",
  "telefono": "987654321",
  "tipoDocumento": "6",
  "estado": "ACTIVO"
}
```

#### Obtener Cliente
```http
GET /api/clients/{ruc}
```

#### Actualizar Cliente
```http
PUT /api/clients/{ruc}
Content-Type: application/json

{
  "razonSocial": "EMPRESA EJEMPLO SAC",
  "direccion": "Nueva dirección",
  "email": "nuevo@ejemplo.com",
  "telefono": "987654321",
  "estado": "ACTIVO"
}
```

### Facturas

#### Crear Factura
```http
POST /api/invoices
Content-Type: application/json

{
  "serie": "F001",
  "numero": 1,
  "fechaEmision": "2024-01-15",
  "fechaVencimiento": "2024-02-15",
  "moneda": "PEN",
  "cliente": {
    "ruc": "20123456789",
    "razonSocial": "EMPRESA CLIENTE SAC",
    "direccion": "Av. Cliente 456, Lima"
  },
  "items": [
    {
      "codigo": "PROD001",
      "descripcion": "Producto de ejemplo",
      "cantidad": 2,
      "precioUnitario": 100.00,
      "valorUnitario": 84.75,
      "igv": 15.25,
      "total": 200.00
    }
  ],
  "totales": {
    "subtotal": 169.50,
    "igv": 30.50,
    "total": 200.00
  }
}
```

#### Obtener Factura
```http
GET /api/invoices/{serie}/{numero}
```

#### Actualizar Estado de Factura
```http
PATCH /api/invoices/{serie}/{numero}/status
Content-Type: application/json

{
  "estado": "ENVIADO"
}
```

#### Enviar Factura a SUNAT
```http
POST /api/invoices/{serie}/{numero}/send-sunat
```

#### Anular Factura
```http
POST /api/invoices/{serie}/{numero}/cancel
Content-Type: application/json

{
  "motivo": "Error en los datos del cliente"
}
```

#### Obtener Estado de Factura
```http
GET /api/invoices/{serie}/{numero}/status
```

## Estados de Factura

- `PENDIENTE`: Factura creada pero no enviada
- `ENVIADO`: Factura enviada a SUNAT
- `ACEPTADO`: Factura aceptada por SUNAT
- `RECHAZADO`: Factura rechazada por SUNAT  
- `ANULADO`: Factura anulada

## Respuestas de la API

### Éxito
```json
{
  "success": true,
  "message": "Operación exitosa",
  "data": { ... }
}
```

### Error
```json
{
  "error": "Tipo de error",
  "message": "Descripción del error",
  "details": { ... }
}
```

## Health Check

```http
GET /health
```

Respuesta:
```json
{
  "status": "OK",
  "message": "API SIGO funcionando correctamente"
}
```# SigoApi
