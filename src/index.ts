import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Rutas
import invoiceRoutes from '@/routes/invoiceRoutes';
import clientRoutes from '@/routes/clientRoutes';
import webhookRoutes from '@/routes/webhookRoutes';

// Middleware
import { 
  errorHandler, 
  notFound, 
  requestLogger, 
  validateJson 
} from '@/middleware/errorHandler';

// Cargar variables de entorno
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Hub-Signature-256'
  ]
}));

// Body parsing
app.use(express.json({ 
  limit: '10mb',
  verify: (req: any, res, buf) => {
    // Guardar raw body para verificación de webhooks
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de logging
if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Middleware para validar JSON
app.use(validateJson);

// Health check básico
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'SIGO API',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// Información de la API
app.get('/api', (req, res) => {
  res.json({
    success: true,
    name: 'SIGO POS API',
    description: 'API para integración con SIGO POS - Facturación electrónica para Colombia',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      invoices: '/api/invoices',
      clients: '/api/clients',
      webhooks: '/api/webhooks',
      health: '/health'
    },
    documentation: '/api/docs',
    timestamp: new Date().toISOString()
  });
});

// Rutas de la API
app.use('/api/invoices', invoiceRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/webhooks', webhookRoutes);

// Documentación simple de la API
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    documentation: {
      invoices: {
        'POST /api/invoices': 'Crear nueva factura',
        'GET /api/invoices': 'Listar facturas',
        'GET /api/invoices/:serie/:numero': 'Obtener factura específica',
        'PUT /api/invoices/:serie/:numero/status': 'Actualizar estado de factura',
        'POST /api/invoices/:serie/:numero/send': 'Enviar factura a DIAN',
        'POST /api/invoices/:serie/:numero/cancel': 'Anular factura'
      },
      clients: {
        'POST /api/clients': 'Crear nuevo cliente',
        'GET /api/clients': 'Listar clientes',
        'GET /api/clients/:tipoDocumento/:numeroDocumento': 'Obtener cliente específico',
        'PUT /api/clients/:tipoDocumento/:numeroDocumento': 'Actualizar cliente',
        'DELETE /api/clients/:tipoDocumento/:numeroDocumento': 'Eliminar cliente'
      },
      webhooks: {
        'POST /api/webhooks/order': 'Procesar webhook de orden (Hub Central)',
        'GET /api/webhooks/pending': 'Listar webhooks pendientes',
        'POST /api/webhooks/retry': 'Reintentar webhook fallido'
      }
    },
    schemas: {
      invoice: {
        serie: 'string',
        numero: 'number',
        fechaEmision: 'string (ISO 8601)',
        cliente: {
          tipoDocumento: 'RUC|NIT|CC|DNI|CE',
          numeroDocumento: 'string',
          razonSocial: 'string',
          email: 'string (optional)',
          telefono: 'string (optional)'
        },
        items: [{
          descripcion: 'string',
          cantidad: 'number',
          precioUnitario: 'number'
        }],
        totales: {
          subtotal: 'number',
          impuestos: 'number',
          total: 'number'
        }
      }
    }
  });
});

// Middleware para rutas no encontradas
app.use(notFound);

// Middleware de manejo de errores (debe ser el último)
app.use(errorHandler);

// Manejo de errores no capturados
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // Graceful shutdown
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Graceful shutdown
  process.exit(1);
});

// Solo iniciar el servidor si no estamos en modo test
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`
🚀 SIGO API Server iniciado
📍 Puerto: ${PORT}
🌍 Entorno: ${process.env.NODE_ENV || 'development'}
🔗 URL: http://localhost:${PORT}
📚 Docs: http://localhost:${PORT}/api/docs
💓 Health: http://localhost:${PORT}/health
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}

export default app;
