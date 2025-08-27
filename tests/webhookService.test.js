const webhookService = require('../src/services/webhookService');

describe('Webhook Service', () => {
  // Usar la instancia exportada
  const service = webhookService;
  
  const mockFacturaData = {
    factura_id: 'FACT-123-20240815',
    documento_sigo_id: 'DOC123',
    numero_documento: 'F001-00000123',
    estado: 'generada',
    pdf_url: 'https://sigo.com/docs/DOC123.pdf',
    xml_url: 'https://sigo.com/docs/DOC123.xml',
    orden_graf: 123,
    monto_original: 95000,
    monto_facturado: 95.00,
    creada_en: '2024-01-15T10:30:00.000Z'
  };

  beforeAll(() => {
    process.env.HUB_CENTRAL_URL = 'http://localhost:3007';
    process.env.APISIGO_WEBHOOK_SECRET = process.env.APISIGO_WEBHOOK_SECRET || 'test_secret';
  });

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generarFirmaHMAC', () => {
    test('debe generar firma HMAC-SHA256 válida', () => {
      const payload = { test: 'data' };
      const secret = 'test_secret';
      
      const firma = service.generarFirmaHMAC(payload, secret);
      
      expect(firma).toBeDefined();
      expect(typeof firma).toBe('string');
      expect(firma.length).toBe(64); // SHA256 hex = 64 caracteres
    });

    test('debe generar firmas consistentes para mismo payload', () => {
      const payload = { order_id: 123, amount: 100 };
      const secret = 'consistent_secret';
      
      const firma1 = service.generarFirmaHMAC(payload, secret);
      const firma2 = service.generarFirmaHMAC(payload, secret);
      
      expect(firma1).toBe(firma2);
    });

    test('debe generar firmas diferentes para secretos diferentes', () => {
      const payload = { test: 'data' };
      
      const firma1 = service.generarFirmaHMAC(payload, 'secret1');
      const firma2 = service.generarFirmaHMAC(payload, 'secret2');
      
      expect(firma1).not.toBe(firma2);
    });
  });

  describe('enviarFacturaCreada', () => {
    test('debe enviar webhook exitosamente', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'received' })
      });

      const resultado = await service.enviarFacturaCreada(mockFacturaData);

      expect(resultado).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3007/webhooks/apisigo',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-apisigo-signature': expect.any(String),
            'User-Agent': 'ApiSigo-Webhook/1.0'
          }),
          body: expect.stringContaining('"event_type":"factura.creada"')
        })
      );
    });

    test('debe incluir datos completos en el payload', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'received' })
      });

      await webhookService.enviarFacturaCreada(mockFacturaData);

      const llamada = global.fetch.mock.calls[0];
      const payload = JSON.parse(llamada[1].body);

      expect(payload).toMatchObject({
        event_type: 'factura.creada',
        event_id: expect.any(String),
        timestamp: expect.any(String),
        source: 'apisigo',
        data: {
          factura_id: 'FACT-123-20240815',
          documento_sigo_id: 'DOC123',
          numero_documento: 'F001-00000123',
          estado: 'generada',
          orden_graf: 123,
          monto_facturado: 95.00,
          pdf_url: 'https://sigo.com/docs/DOC123.pdf',
          xml_url: 'https://sigo.com/docs/DOC123.xml'
        }
      });
    });

    test('debe incluir firma HMAC válida', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'received' })
      });

      await webhookService.enviarFacturaCreada(mockFacturaData);

      const llamada = global.fetch.mock.calls[0];
      const headers = llamada[1].headers;
      const payload = JSON.parse(llamada[1].body);
      
      expect(headers['x-apisigo-signature']).toBeDefined();
      
      // Verificar que la firma sea válida
      const firmaEsperada = webhookService.generarFirmaHMAC(payload, 'test_secret');
      expect(headers['x-apisigo-signature']).toBe(`sha256=${firmaEsperada}`);
    });
  });

  describe('Manejo de errores y reintentos', () => {
    test('debe reintentar en caso de error HTTP', async () => {
      // Primer intento falla, segundo intento exitoso
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error')
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'received' })
        });

      const resultado = await webhookService.enviarFacturaCreada(mockFacturaData);

      expect(resultado).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('debe fallar después de máximo número de reintentos', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error')
      });

      const resultado = await webhookService.enviarFacturaCreada(mockFacturaData);

      expect(resultado).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3); // 3 intentos máximo
    });

    test('debe manejar errores de red', async () => {
      global.fetch.mockRejectedValue(new Error('Network Error'));

      const resultado = await webhookService.enviarFacturaCreada(mockFacturaData);

      expect(resultado).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('debe aplicar backoff exponencial en reintentos', async () => {
      const tiemposInicio = [];
      
      global.fetch.mockImplementation(() => {
        tiemposInicio.push(Date.now());
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error')
        });
      });

      const inicioTest = Date.now();
      await webhookService.enviarFacturaCreada(mockFacturaData);
      const finTest = Date.now();

      // Verificar que el tiempo total sea mayor al mínimo esperado
      // 1000ms + 2000ms = 3000ms mínimo de espera entre reintentos
      expect(finTest - inicioTest).toBeGreaterThan(2900);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Validaciones', () => {
    test('debe validar datos obligatorios', async () => {
      const datosIncompletos = {
        factura_id: 'FACT-123'
        // Faltan otros campos obligatorios
      };

      await expect(
        webhookService.enviarFacturaCreada(datosIncompletos)
      ).rejects.toThrow('Datos de factura incompletos');
    });

    test('debe validar URL de Hub Central', async () => {
      process.env.HUB_CENTRAL_URL = '';

      await expect(
        webhookService.enviarFacturaCreada(mockFacturaData)
      ).rejects.toThrow('URL de Hub Central no configurada');

      // Restaurar
      process.env.HUB_CENTRAL_URL = 'http://localhost:3007';
    });

    test('debe validar secret de webhook', async () => {
      process.env.APISIGO_WEBHOOK_SECRET = '';

      await expect(
        webhookService.enviarFacturaCreada(mockFacturaData)
      ).rejects.toThrow('Secret de webhook no configurado');

      // Restaurar
      process.env.APISIGO_WEBHOOK_SECRET = 'test_secret';
    });
  });
});
