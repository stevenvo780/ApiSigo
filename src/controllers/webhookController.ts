import { Request, Response, NextFunction } from 'express';
import { body, header, validationResult } from 'express-validator';
import crypto from 'crypto';
import { facturaService } from '@/services/facturaService';
import { webhookService } from '@/services/webhookService';
import { WebhookOrderData } from '@/types';

// Validaciones para webhook
export const validateWebhook = [
  // header('x-hub-signature-256').notEmpty().withMessage('Firma HMAC es requerida'),
  // header('user-agent').contains('HubCentral-Webhooks').withMessage('User-Agent inválido'),
  // body('order').notEmpty().withMessage('Datos de la orden son requeridos'),
  // body('order.id').notEmpty().withMessage('ID de la orden es requerido'),
  // body('order.total').isFloat({ min: 0 }).withMessage('Total debe ser mayor a 0'),
  // body('order.customer').notEmpty().withMessage('Datos del cliente son requeridos'),
  // body('order.items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item')
];

// Validaciones para reintento de webhook
export const validateWebhookRetry = [
  body('webhookId').notEmpty().withMessage('ID del webhook es requerido'),
  body('url').isURL().withMessage('URL debe ser válida'),
  body('data').notEmpty().withMessage('Datos del webhook son requeridos')
];

export interface WebhookRequest extends Request {
  body: {
    order?: WebhookOrderData; // Para compatibilidad con HubCentral
    event_type?: string; // Campo de Graf
    data?: { // Estructura de Graf
      order_id: number;
      store_id: number;
      customer_id?: number;
      user_id?: number;
      amount: number;
      currency: string;
      items: Array<{
        product_id: number;
        product_name: string;
        quantity: number;
        unit_price: number;
        total: number;
      }>;
      shipping_address?: any;
      delivery_zone_id?: number;
      paid_at: string;
      created_at: string;
      updated_at: string;
      plugins_credentials?: {
        sigo?: {
          apiKey?: string;
          username?: string;
        };
      };
    };
    event?: string; // Para compatibilidad con HubCentral
    timestamp?: number; // Para compatibilidad con HubCentral
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

    // Usar rawBody si está disponible, sino usar JSON stringified
    const payload = (req as any).rawBody ? (req as any).rawBody.toString() : JSON.stringify(req.body);
    console.log('[DEBUG] Verificando firma HMAC:', {
      hasRawBody: !!(req as any).rawBody,
      payloadLength: payload.length,
      signature: signature,
      secret: secret.substring(0, 10) + '...'
    });
    
    const isValid = verifyWebhookSignature(payload, signature, secret);

    if (!isValid) {
      console.error('[DEBUG] Firma HMAC inválida');
      res.status(401).json({
        error: 'Firma HMAC inválida'
      });
      return;
    }

    console.log('[DEBUG] Firma HMAC válida');
    next();
  } catch (error) {
    console.error('[DEBUG] Error verificando firma:', error);
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

    // Detectar si es estructura de Graf o HubCentral
    const isGrafWebhook = req.body.event_type && req.body.data;
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let orderData: any;
    let event: string;
    let sigoCredentials: any;
    
    if (isGrafWebhook) {
      // Estructura de Graf
      const grafData = req.body.data!;
      event = req.body.event_type!;
      sigoCredentials = grafData.plugins_credentials?.sigo;
      
      console.log(`[${webhookId}] Procesando webhook de Graf - orden: ${grafData.order_id}, evento: ${event}`);
      console.log(`[${webhookId}] DEBUG - Estructura del webhook de Graf:`, JSON.stringify(grafData, null, 2));
      
      // Mapear estructura de Graf a WebhookOrderData
      orderData = {
        order_id: grafData.order_id,
        store_id: grafData.store_id,
        customer_id: grafData.customer_id || grafData.user_id,
        amount: grafData.amount,
        currency: grafData.currency || 'COP',
        items: grafData.items.map((item: any) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total
        })),
        paid_at: grafData.paid_at,
        customer_name: 'Cliente Graf', // Graf no envía customer_name directamente
        shipping_address: grafData.shipping_address
      };
    } else {
      // Estructura de HubCentral
      const { order, event: hubEvent, timestamp, plugins_credentials } = req.body as {
        order: WebhookOrderData;
        event: string;
        timestamp: number;
        plugins_credentials?: {
          sigo?: {
            apiKey?: string;
            username?: string;
          };
        };
      };
      event = hubEvent;
      sigoCredentials = plugins_credentials?.sigo;
      orderData = order;
      
      console.log(`[${webhookId}] Procesando webhook de HubCentral - orden: ${order.order_id}, evento: ${event}`);
      console.log(`[${webhookId}] DEBUG - Estructura del webhook de HubCentral:`, JSON.stringify(order, null, 2));
    }

    // Procesar según el tipo de evento
    switch (event) {
      case 'order.created':
      case 'order.completed':
      case 'order.paid': // Evento de Graf
        try {
          // Extraer credenciales de Siigo del webhook
          console.log(`[${webhookId}] DEBUG - Credenciales Sigio recibidas:`, {
            hasApiKey: !!sigoCredentials?.apiKey,
            hasUsername: !!sigoCredentials?.username,
            apiKeyStart: sigoCredentials?.apiKey?.substring(0, 10) + '...' || 'N/A'
          });
          
          const facturaResult = await facturaService.crearFacturaDesdeWebhook(orderData, sigoCredentials);
          
          // Enviar confirmación al Hub Central
          await webhookService.enviarFacturaCreada(facturaResult);

          res.status(200).json({
            success: true,
            message: 'Webhook procesado exitosamente',
            data: {
              webhookId,
              orderId: orderData.order_id,
              event,
              facturaResult
            }
          });
        } catch (facturaError) {
          console.error(`[${webhookId}] Error creando factura:`, facturaError);
          
          // Enviar error al Hub Central
          await webhookService.enviarError(orderData.order_id, {
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
        const cancelOrderId = orderData.order_id;
        console.log(`[${webhookId}] Procesando cancelación de orden: ${cancelOrderId}`);
        res.status(200).json({
          success: true,
          message: 'Cancelación procesada',
          data: {
            webhookId,
            orderId: cancelOrderId,
            event
          }
        });
        break;

      case 'order.refunded':
        // Procesar reembolso de orden
        const refundOrderId = orderData.order_id;
        console.log(`[${webhookId}] Procesando reembolso de orden: ${refundOrderId}`);
        res.status(200).json({
          success: true,
          message: 'Reembolso procesado',
          data: {
            webhookId,
            orderId: refundOrderId,
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

    // Consultar estado en base de datos
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

