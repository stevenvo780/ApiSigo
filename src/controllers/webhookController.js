const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const facturaService = require('../services/facturaService');
const webhookService = require('../services/webhookService');

/**
 * Validaciones para el webhook de Hub Central
 */
const validateWebhookPayload = [
  body('event_type').equals('pedido.pagado').withMessage('Tipo de evento debe ser pedido.pagado'),
  body('data.order_id').isInt({ min: 1 }).withMessage('ID de orden debe ser un entero positivo'),
  body('data.store_id').isInt({ min: 1 }).withMessage('ID de tienda debe ser un entero positivo'),
  body('data.amount').isFloat({ min: 0 }).withMessage('Monto debe ser mayor a 0'),
  body('data.currency').equals('COP').withMessage('Moneda debe ser COP'),
  body('data.items').isArray({ min: 1 }).withMessage('Debe incluir al menos un item'),
  body('data.items.*.product_id').isInt({ min: 1 }).withMessage('ID de producto requerido'),
  body('data.items.*.product_name').notEmpty().withMessage('Nombre de producto requerido'),
  body('data.items.*.quantity').isInt({ min: 1 }).withMessage('Cantidad debe ser positiva'),
  body('data.items.*.unit_price').isFloat({ min: 0 }).withMessage('Precio unitario requerido'),
  body('data.paid_at').isISO8601().withMessage('Fecha de pago debe ser válida')
];

/**
 * Validar firma HMAC-SHA256 del Hub Central
 */
const validateHubSignature = (req, res, next) => {
  try {
    const signature = req.headers['x-hub-signature'];
    const payload = JSON.stringify(req.body);
    const secret = process.env.HUB_WEBHOOK_SECRET;

    if (!signature) {
      return res.status(401).json({
        status: 'error',
        message: 'Firma de webhook requerida'
      });
    }

    if (!secret) {
      console.error('HUB_WEBHOOK_SECRET no configurado');
      return res.status(500).json({
        status: 'error',
        message: 'Configuración de webhook incompleta'
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const receivedSignature = signature.replace('sha256=', '');

    if (expectedSignature !== receivedSignature) {
      console.error('Firma de webhook inválida', {
        received: receivedSignature,
        expected: expectedSignature
      });
      return res.status(401).json({
        status: 'error',
        message: 'Firma de webhook inválida'
      });
    }

    next();
  } catch (error) {
    console.error('Error validando firma de webhook:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno validando webhook'
    });
  }
};

/**
 * Procesar webhook de pedido pagado desde Hub Central
 * Crear factura en SIGO y enviar confirmación al Hub
 */
const procesarPedidoPagado = async (req, res, next) => {
  try {
    // Validar datos del payload
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Datos de webhook inválidos',
        errors: errors.array()
      });
    }

    const { event_type, data } = req.body;
    
    console.log(`Procesando webhook ${event_type} para orden ${data.order_id}`);

    // Crear factura en SIGO
    const facturaResult = await facturaService.crearFacturaDesdeWebhook(data);

    // Respuesta inmediata al Hub Central
    const response = {
      status: 'success',
      factura_id: facturaResult.factura_id,
      sigo_response: {
        documento_id: facturaResult.documento_sigo_id,
        estado: facturaResult.estado,
        pdf_url: facturaResult.pdf_url
      },
      processed_at: new Date().toISOString()
    };

    // Enviar webhook de confirmación al Hub Central (asíncrono)
    setImmediate(async () => {
      try {
        await webhookService.enviarFacturaCreada({
          factura_id: facturaResult.factura_id,
          order_id: data.order_id,
          documento_sigo_id: facturaResult.documento_sigo_id,
          estado: facturaResult.estado,
          monto: data.amount,
          pdf_url: facturaResult.pdf_url,
          created_at: new Date().toISOString()
        });
        console.log(`Webhook factura.creada enviado para orden ${data.order_id}`);
      } catch (webhookError) {
        console.error('Error enviando webhook de confirmación:', webhookError);
        // No afecta la respuesta principal, se maneja asíncronamente
      }
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('Error procesando pedido pagado:', error);
    
    // Determinar tipo de error para respuesta apropiada
    if (error.name === 'SigoApiError') {
      return res.status(502).json({
        status: 'error',
        message: 'Error en API de SIGO',
        details: error.message
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        status: 'error',
        message: 'Error de validación',
        details: error.message
      });
    }

    // Error genérico
    res.status(500).json({
      status: 'error',
      message: 'Error interno procesando webhook',
      order_id: req.body?.data?.order_id
    });
  }
};

/**
 * Endpoint de health check específico para webhooks
 */
const healthCheck = (req, res) => {
  res.json({
    status: 'OK',
    service: 'ApiSigo Webhooks',
    timestamp: new Date().toISOString(),
    endpoints: {
      facturas: 'POST /api/facturas'
    }
  });
};

module.exports = {
  validateWebhookPayload,
  validateHubSignature,
  procesarPedidoPagado,
  healthCheck
};
