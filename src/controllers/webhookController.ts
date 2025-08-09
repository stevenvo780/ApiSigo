import { Request, Response, NextFunction } from 'express';
import { body, header, validationResult } from 'express-validator';
import crypto from 'crypto';
import { facturaService } from '@/services/facturaService';
import { webhookService } from '@/services/webhookService';
import { WebhookOrderData } from '@/types';

// Validaciones para webhook
export const validateWebhook = [
  header('x-hub-signature-256').notEmpty().withMessage('Firma HMAC es requerida'),
  header('user-agent').contains('HubCentral-Webhooks').withMessage('User-Agent inválido'),
  body('order').notEmpty().withMessage('Datos de la orden son requeridos'),
  body('order.id').notEmpty().withMessage('ID de la orden es requerido'),
  body('order.total').isFloat({ min: 0 }).withMessage('Total debe ser mayor a 0'),
  body('order.customer').notEmpty().withMessage('Datos del cliente son requeridos'),
  body('order.items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item')
];

// Validaciones para reintento de webhook
export const validateWebhookRetry = [
  body('webhookId').notEmpty().withMessage('ID del webhook es requerido'),
  body('url').isURL().withMessage('URL debe ser válida'),
  body('data').notEmpty().withMessage('Datos del webhook son requeridos')
];

export interface WebhookRequest extends Request {
  body: {
    order: WebhookOrderData;
    event: string;
    timestamp: number;
  };
  headers: Request['headers'] & {
    'x-hub-signature-256'?: string;
    'user-agent'?: string;
    'content-type'?: string;
  };
}

export interface WebhookRetryRequest extends Request {
  body: {
    webhookId: string;
    url: string;
    data: any;
    retryCount?: number;
  };
}

export interface WebhookStatusRequest extends Request {
  params: {
    webhookId: string;
  };
}

/**
 * Verificar firma HMAC del webhook
 */
const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  try {
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex')}`;
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Error verificando firma HMAC:', error);
    return false;
  }
};

/**
 * Middleware para verificar la firma del webhook
 */
export const verifySignature = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const secret = process.env.WEBHOOK_SECRET || 'default-secret';
    
    if (!signature) {
      res.status(401).json({
        error: 'Firma HMAC no proporcionada'
      });
      return;
    }

    const payload = JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(payload, signature, secret);

    if (!isValid) {
      res.status(401).json({
        error: 'Firma HMAC inválida'
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({
      error: 'Error verificando firma del webhook'
    });
  }
};

/**
 * Procesar webhook de orden
 */
export const processOrderWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
      return;
    }

    const { order, event, timestamp } = req.body as {
      order: WebhookOrderData;
      event: string;
      timestamp: number;
    };
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[${webhookId}] Procesando webhook de orden: ${order.id}, evento: ${event}`);

    // Procesar según el tipo de evento
    switch (event) {
      case 'order.created':
      case 'order.completed':
        try {
          const facturaResult = await facturaService.crearFacturaDesdeWebhook(order);
          
          // Enviar confirmación al Hub Central
          await webhookService.enviarFacturaCreada(facturaResult);

          res.status(200).json({
            success: true,
            message: 'Webhook procesado exitosamente',
            data: {
              webhookId,
              orderId: order.id,
              event,
              facturaId: facturaResult.factura_id,
              sigoId: facturaResult.sigo_id
            }
          });
        } catch (facturaError) {
          console.error(`[${webhookId}] Error creando factura:`, facturaError);
          
          // Enviar error al Hub Central
          await webhookService.enviarError(order.id, {
            error: 'Error creando factura',
            details: facturaError instanceof Error ? facturaError.message : 'Unknown error'
          });

          res.status(500).json({
            error: 'Error procesando la orden',
            webhookId,
            details: facturaError instanceof Error ? facturaError.message : 'Unknown error'
          });
        }
        break;

      case 'order.cancelled':
        // Procesar cancelación de orden
        console.log(`[${webhookId}] Procesando cancelación de orden: ${order.id}`);
        res.status(200).json({
          success: true,
          message: 'Cancelación procesada',
          data: {
            webhookId,
            orderId: order.id,
            event
          }
        });
        break;

      case 'order.refunded':
        // Procesar reembolso de orden
        console.log(`[${webhookId}] Procesando reembolso de orden: ${order.id}`);
        res.status(200).json({
          success: true,
          message: 'Reembolso procesado',
          data: {
            webhookId,
            orderId: order.id,
            event
          }
        });
        break;

      default:
        console.log(`[${webhookId}] Evento no reconocido: ${event}`);
        res.status(400).json({
          error: 'Tipo de evento no soportado',
          event
        });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Reintentar webhook
 */
export const retryWebhook = async (req: WebhookRetryRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array()
      });
      return;
    }

    const { webhookId, url, data, retryCount = 0 } = req.body;

    console.log(`Reintentando webhook ${webhookId}, intento: ${retryCount + 1}`);

    const result = await webhookService.enviarWebhookConReintentos(url, data, {
      maxIntentos: 3,
      delayBase: 1000,
      timeout: 5000
    });

    res.json({
      success: true,
      message: 'Webhook reintentado exitosamente',
      data: {
        webhookId,
        retryCount: retryCount + 1,
        result
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener estado del webhook
 */
export const getWebhookStatus = async (req: WebhookStatusRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { webhookId } = req.params;

    // En una implementación real, esto consultaría una base de datos
    // Por ahora retornamos un estado mock
    res.json({
      success: true,
      data: {
        webhookId,
        status: 'completed',
        timestamp: new Date().toISOString(),
        attempts: 1,
        lastAttempt: new Date().toISOString(),
        nextRetry: null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Listar webhooks pendientes
 */
export const getPendingWebhooks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // En una implementación real, esto consultaría una base de datos
    res.json({
      success: true,
      data: {
        webhooks: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Health check del sistema de webhooks
 */
export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const timestamp = new Date().toISOString();
    
    res.json({
      success: true,
      service: 'Webhook Controller',
      timestamp,
      status: 'healthy',
      endpoints: {
        process: '/api/webhooks/order',
        retry: '/api/webhooks/retry',
        status: '/api/webhooks/:webhookId/status',
        pending: '/api/webhooks/pending'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      service: 'Webhook Controller',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Endpoint de prueba para webhooks
 */
export const testWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const testOrder: WebhookOrderData = {
      id: `test_order_${Date.now()}`,
      numero: `TEST-${Date.now()}`,
      total: 118,
      subtotal: 100,
      impuestos: 18,
      moneda: 'PEN',
      fechaCreacion: new Date().toISOString(),
      estado: 'completed',
      customer: {
        id: 'test_customer',
        tipoDocumento: 'DNI',
        numeroDocumento: '12345678',
        nombres: 'Cliente de Prueba',
        apellidos: 'Apellido Prueba',
        email: 'test@example.com',
        telefono: '999999999',
        direccion: {
          direccion: 'Av. Test 123',
          ciudad: 'Lima',
          departamento: 'Lima',
          codigoPostal: '15001',
          pais: 'PE'
        }
      },
      items: [
        {
          id: 'test_item_1',
          nombre: 'Producto de Prueba',
          descripcion: 'Descripción del producto de prueba',
          cantidad: 1,
          precioUnitario: 100,
          subtotal: 100,
          impuestos: 18,
          total: 118,
          sku: 'TEST-SKU-001'
        }
      ],
      descuentos: [],
      metadatos: {
        fuente: 'test',
        canal: 'api'
      }
    };

    const result = await facturaService.crearFacturaDesdeWebhook(testOrder);

    res.json({
      success: true,
      message: 'Webhook de prueba procesado exitosamente',
      data: {
        testOrder,
        facturaResult: result
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
