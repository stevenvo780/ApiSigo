import { Router } from 'express';
import {
  processOrderWebhook,
  retryWebhook,
  getWebhookStatus,
  getPendingWebhooks,
  testWebhook,
  healthCheck,
  verifySignature,
  validateWebhook,
  validateWebhookRetry
} from '@/controllers/webhookController';

const router = Router();

/**
 * @route   POST /api/webhooks/order
 * @desc    Procesar webhook de orden del Hub Central
 * @access  Public (con verificación HMAC)
 */
router.post('/order', verifySignature, validateWebhook, processOrderWebhook);

/**
 * @route   POST /api/webhooks/retry
 * @desc    Reintentar webhook fallido
 * @access  Private
 */
router.post('/retry', validateWebhookRetry, retryWebhook);

/**
 * @route   GET /api/webhooks/pending
 * @desc    Obtener lista de webhooks pendientes
 * @access  Private
 */
router.get('/pending', getPendingWebhooks);

/**
 * @route   GET /api/webhooks/health
 * @desc    Health check del sistema de webhooks
 * @access  Public
 */
router.get('/health', healthCheck);

/**
 * @route   POST /api/webhooks/test
 * @desc    Endpoint de prueba para webhooks
 * @access  Private
 */
router.post('/test', testWebhook);

/**
 * @route   GET /api/webhooks/:webhookId/status
 * @desc    Obtener estado de un webhook específico
 * @access  Private
 */
router.get('/:webhookId/status', getWebhookStatus);

export default router;
