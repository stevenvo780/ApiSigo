const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

/**
 * Endpoint principal para recibir webhooks del Hub Central
 * POST /api/facturas - Crear factura desde webhook pedido.pagado
 */
router.post('/', 
  webhookController.validateHubSignature,
  webhookController.validateWebhookPayload,
  webhookController.procesarPedidoPagado
);

/**
 * Health check específico para webhooks
 * GET /api/facturas/health
 */
router.get('/health', webhookController.healthCheck);

module.exports = router;
