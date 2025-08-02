jest.mock('../src/services/webhookService', () => {
  return class MockWebhookService {
    constructor() {
      this.maxRetries = 3;
    }

    generarFirmaHMAC(payload, secret) {
      const crypto = require('crypto');
      return crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    }

    async enviarFacturaCreada(facturaData) {
      // Validaciones para tests
      if (!process.env.HUB_CENTRAL_URL) {
        throw new Error('URL de Hub Central no configurada');
      }
      if (!process.env.APISIGO_WEBHOOK_SECRET) {
        throw new Error('Secret de webhook no configurado');
      }
      if (!facturaData?.factura_id) {
        throw new Error('Datos de factura incompletos');
      }

      return fetch ? await this.enviarWebhookReal(facturaData) : true;
    }

    async enviarWebhookReal(facturaData) {
      const payload = {
        event_type: 'factura.creada',
        data: facturaData
      };

      const response = await fetch(`${process.env.HUB_CENTRAL_URL}/webhooks/apisigo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-apisigo-signature': `sha256=${this.generarFirmaHMAC(payload, process.env.APISIGO_WEBHOOK_SECRET)}`
        },
        body: JSON.stringify(payload)
      });

      return response.ok;
    }
  };
});

jest.mock('../src/services/facturaService', () => ({
  crearFacturaDesdeWebhook: jest.fn(),
  transformarDatosParaSigo: jest.fn(),
  calcularIGV: jest.fn()
}));
