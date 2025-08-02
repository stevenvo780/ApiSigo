const axios = require('axios');
const crypto = require('crypto');

/**
 * Servicio para enviar webhooks de vuelta al Hub Central
 */
class WebhookService {
  constructor() {
    this.hubCentralUrl = process.env.HUB_CENTRAL_URL;
    this.webhookSecret = process.env.APISIGO_WEBHOOK_SECRET;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo inicial

    this.client = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ApiSigo-Webhook/1.0'
      }
    });
  }

  /**
   * Generar firma HMAC-SHA256 para validación
   * @param {Object} payload - Payload a firmar
   * @param {string} secret - Secret para la firma
   * @returns {string} Firma HMAC-SHA256
   */
  generarFirmaHMAC(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Enviar webhook factura.creada al Hub Central
   * @param {Object} facturaData - Datos de la factura creada
   */
  async enviarFacturaCreada(facturaData) {
    // Validaciones previas
    if (!this.hubCentralUrl) {
      throw new Error('URL de Hub Central no configurada');
    }
    
    if (!this.webhookSecret) {
      throw new Error('Secret de webhook no configurado');
    }

    if (!facturaData?.factura_id || !facturaData?.documento_sigo_id) {
      throw new Error('Datos de factura incompletos');
    }
    const payload = {
      event_type: 'factura.creada',
      source: 'apisigo',
      timestamp: new Date().toISOString(),
      data: facturaData
    };

    const url = `${this.hubCentralUrl}/api/v1/webhooks/apisigo/factura-creada`;
    
    return this.enviarWebhookConReintentos(url, payload);
  }

  /**
   * Enviar webhook con sistema de reintentos
   * @param {string} url - URL del webhook
   * @param {Object} payload - Datos a enviar
   */
  async enviarWebhookConReintentos(url, payload) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const signature = this.generarFirmaHMAC(payload, this.webhookSecret);
        
        const response = await this.client.post(url, payload, {
          headers: {
            'x-apisigo-signature': `sha256=${signature}`
          }
        });

        console.log(`Webhook enviado exitosamente (intento ${attempt}):`, {
          url,
          status: response.status,
          event_type: payload.event_type
        });

        return response.data;

      } catch (error) {
        lastError = error;
        
        console.error(`Error enviando webhook (intento ${attempt}/${this.maxRetries}):`, {
          url,
          status: error.response?.status,
          message: error.message,
          event_type: payload.event_type
        });

        // Si es el último intento, no esperar
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Backoff exponencial
          await this.wait(delay);
        }
      }
    }

    // Si llegamos aquí, todos los reintentos fallaron
    return false;
  }

  /**
   * Generar firma HMAC-SHA256 para el webhook
   * @param {Object} payload - Datos del webhook
   * @returns {string} Firma hexadecimal
   */
  generarFirma(payload) {
    if (!this.webhookSecret) {
      throw new Error('APISIGO_WEBHOOK_SECRET no configurado');
    }

    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Función helper para esperar
   * @param {number} ms - Milisegundos a esperar
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validar configuración del servicio
   */
  validateConfig() {
    if (!this.hubCentralUrl) {
      throw new Error('HUB_CENTRAL_URL no configurado');
    }
    
    if (!this.webhookSecret) {
      throw new Error('APISIGO_WEBHOOK_SECRET no configurado');
    }

    return true;
  }

  /**
   * Health check del servicio de webhooks
   */
  async healthCheck() {
    try {
      this.validateConfig();
      
      // Probar conectividad al Hub Central
      const healthUrl = `${this.hubCentralUrl}/api/v1/health`;
      const response = await this.client.get(healthUrl, { timeout: 5000 });
      
      return {
        status: 'healthy',
        hubCentral: {
          url: this.hubCentralUrl,
          reachable: true,
          status: response.status
        },
        config: {
          maxRetries: this.maxRetries,
          retryDelay: this.retryDelay,
          secretConfigured: !!this.webhookSecret
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        hubCentral: {
          url: this.hubCentralUrl,
          reachable: false
        }
      };
    }
  }
}

module.exports = new WebhookService();
