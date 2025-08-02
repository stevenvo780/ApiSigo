const request = require('supertest');
const crypto = require('crypto');

// Mock antes de importar la app
jest.mock('../src/services/facturaService', () => ({
  crearFacturaDesdeWebhook: jest.fn()
}));

jest.mock('../src/services/webhookService', () => ({
  enviarFacturaCreada: jest.fn()
}));

const app = require('../src/index');
const facturaService = require('../src/services/facturaService');
const webhookService = require('../src/services/webhookService');

describe('Webhook Controller - POST /api/facturas', () => {
  const validPayload = {
    event_type: 'pedido.pagado',
    data: {
      order_id: 123,
      store_id: 1,
      customer_id: 456,
      user_id: 789,
      amount: 95000,
      currency: 'COP',
      items: [
        {
          product_id: 1,
          product_name: 'Producto de prueba',
          quantity: 1,
          unit_price: 95000,
          total: 95000
        }
      ],
      paid_at: '2024-01-15T10:30:00.000Z'
    }
  };

  const generateSignature = (payload) => {
    const secret = process.env.HUB_WEBHOOK_SECRET || 'test_secret';
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  };

  beforeAll(() => {
    // Configurar variables de entorno para tests
    process.env.HUB_WEBHOOK_SECRET = 'test_secret';
    process.env.HUB_CENTRAL_URL = 'http://localhost:3007';
    process.env.APISIGO_WEBHOOK_SECRET = 'apisigo_test_secret';
    process.env.SIGO_API_URL = 'https://api.sigo.com';
    process.env.SIGO_SERIE_DEFAULT = 'F001';
    process.env.SIGO_RUC_GENERICO = '20000000001';
  });

  describe('Validación de firma', () => {
    test('debe rechazar request sin firma', async () => {
      const response = await request(app)
        .post('/api/facturas')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Firma de webhook requerida');
    });

    test('debe rechazar request con firma inválida', async () => {
      const response = await request(app)
        .post('/api/facturas')
        .set('x-hub-signature', 'sha256=invalid_signature')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Firma de webhook inválida');
    });

    test('debe aceptar request con firma válida', async () => {
      const signature = generateSignature(validPayload);
      
      // Mock de servicios
      facturaService.crearFacturaDesdeWebhook.mockResolvedValue({
        factura_id: 'FACT-123-20240815',
        documento_sigo_id: 'DOC123',
        estado: 'generada',
        pdf_url: 'https://sigo.com/docs/DOC123.pdf'
      });

      webhookService.enviarFacturaCreada.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/facturas')
        .set('x-hub-signature', `sha256=${signature}`)
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.factura_id).toBeDefined();
    });
  });

  describe('Validación de payload', () => {
    test('debe rechazar payload sin event_type', async () => {
      const invalidPayload = { ...validPayload };
      delete invalidPayload.event_type;
      
      const signature = generateSignature(invalidPayload);

      const response = await request(app)
        .post('/api/facturas')
        .set('x-hub-signature', `sha256=${signature}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('inválidos');
    });

    test('debe rechazar payload con event_type incorrecto', async () => {
      const invalidPayload = { ...validPayload, event_type: 'pedido.cancelado' };
      const signature = generateSignature(invalidPayload);

      const response = await request(app)
        .post('/api/facturas')
        .set('x-hub-signature', `sha256=${signature}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Tipo de evento debe ser pedido.pagado'
          })
        ])
      );
    });

    test('debe rechazar payload sin items', async () => {
      const invalidPayload = { ...validPayload };
      invalidPayload.data.items = [];
      
      const signature = generateSignature(invalidPayload);

      const response = await request(app)
        .post('/api/facturas')
        .set('x-hub-signature', `sha256=${signature}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Debe incluir al menos un item'
          })
        ])
      );
    });

    test('debe rechazar payload con monto inválido', async () => {
      const invalidPayload = { ...validPayload };
      invalidPayload.data.amount = -100;
      
      const signature = generateSignature(invalidPayload);

      const response = await request(app)
        .post('/api/facturas')
        .set('x-hub-signature', `sha256=${signature}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Monto debe ser mayor a 0'
          })
        ])
      );
    });
  });

  describe('Health check', () => {
    test('debe responder health check correctamente', async () => {
      const response = await request(app)
        .get('/api/facturas/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.service).toBe('ApiSigo Webhooks');
      expect(response.body.endpoints).toBeDefined();
    });
  });
});
