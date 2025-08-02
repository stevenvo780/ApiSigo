const facturaService = require('../src/services/facturaService');

describe('Factura Service', () => {
  const mockWebhookData = {
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
        quantity: 2,
        unit_price: 47500,
        total: 95000
      }
    ],
    paid_at: '2024-01-15T10:30:00.000Z'
  };

  beforeAll(() => {
    process.env.SIGO_SERIE_DEFAULT = 'F001';
    process.env.SIGO_RUC_GENERICO = '20000000001';
  });

  describe('transformarDatosParaSigo', () => {
    test('debe transformar datos de Graf a formato SIGO correctamente', () => {
      const resultado = facturaService.transformarDatosParaSigo(mockWebhookData);
      
      expect(resultado).toMatchObject({
        tipo_documento: 'FACTURA',
        serie: 'F001',
        numero_correlativo: expect.any(String),
        fecha_emision: '2024-01-15',
        hora_emision: '10:30:00',
        cliente: {
          tipo_documento: 'RUC',
          numero_documento: '20000000001',
          razon_social: 'Cliente Genérico'
        },
        moneda: 'PEN',
        referencia_externa: {
          orden_graf: 123,
          tienda_graf: 1,
          pagado_en: '2024-01-15T10:30:00.000Z'
        }
      });

      expect(resultado.items).toHaveLength(1);
      expect(resultado.items[0]).toMatchObject({
        codigo_producto: 'GRAF-1',
        descripcion: 'Producto de prueba',
        cantidad: 2,
        unidad_medida: 'UNI',
        valor_unitario: 40.25,
        precio_unitario: 47.50,
        valor_total: 80.51,
        igv_total: 14.49,
        precio_total: 95.00
      });
    });

    test('debe manejar múltiples items correctamente', () => {
      const dataConMultiplesItems = {
        ...mockWebhookData,
        amount: 150000,
        items: [
          {
            product_id: 1,
            product_name: 'Producto 1',
            quantity: 1,
            unit_price: 50000,
            total: 50000
          },
          {
            product_id: 2,
            product_name: 'Producto 2',
            quantity: 2,
            unit_price: 50000,
            total: 100000
          }
        ]
      };

      const resultado = facturaService.transformarDatosParaSigo(dataConMultiplesItems);
      
      expect(resultado.items).toHaveLength(2);
      expect(resultado.resumen.valor_venta).toBe(127.12);
      expect(resultado.resumen.igv).toBe(22.88);
      expect(resultado.resumen.total).toBe(150.00);
    });

    test('debe generar número correlativo único', () => {
      const resultado1 = facturaService.transformarDatosParaSigo(mockWebhookData);
      const resultado2 = facturaService.transformarDatosParaSigo(mockWebhookData);
      
      expect(resultado1.numero_correlativo).not.toBe(resultado2.numero_correlativo);
      expect(resultado1.numero_correlativo).toMatch(/^\d{8}$/);
      expect(resultado2.numero_correlativo).toMatch(/^\d{8}$/);
    });
  });

  describe('calcularIGV', () => {
    test('debe calcular IGV peruano (18%) correctamente', () => {
      const casos = [
        { valor: 100, esperado: { valorSinIGV: 84.75, igv: 15.25 } },
        { valor: 50, esperado: { valorSinIGV: 42.37, igv: 7.63 } },
        { valor: 1180, esperado: { valorSinIGV: 1000.00, igv: 180.00 } }
      ];

      casos.forEach(({ valor, esperado }) => {
        const resultado = facturaService.calcularIGV(valor);
        expect(resultado.valorSinIGV).toBeCloseTo(esperado.valorSinIGV, 2);
        expect(resultado.igv).toBeCloseTo(esperado.igv, 2);
      });
    });

    test('debe sumar correctamente valor + IGV = total', () => {
      const valores = [100, 50, 250, 1000];
      
      valores.forEach(valor => {
        const resultado = facturaService.calcularIGV(valor);
        const total = resultado.valorSinIGV + resultado.igv;
        expect(total).toBeCloseTo(valor, 2);
      });
    });
  });

  describe('crearFacturaDesdeWebhook', () => {
    beforeEach(() => {
      // Mock fetch para evitar llamadas HTTP reales
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('debe crear factura exitosamente', async () => {
      const respuestaMockSigo = {
        id: 'DOC123',
        numero_documento: 'F001-00000123',
        estado: 'emitido',
        pdf_url: 'https://sigo.com/docs/DOC123.pdf',
        xml_url: 'https://sigo.com/docs/DOC123.xml'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(respuestaMockSigo)
      });

      const resultado = await facturaService.crearFacturaDesdeWebhook(mockWebhookData);

      expect(resultado).toMatchObject({
        factura_id: 'FACT-123-20240815',
        documento_sigo_id: 'DOC123',
        numero_documento: 'F001-00000123',
        estado: 'generada',
        pdf_url: 'https://sigo.com/docs/DOC123.pdf',
        xml_url: 'https://sigo.com/docs/DOC123.xml',
        orden_graf: 123,
        monto_original: 95000,
        monto_facturado: 95.00,
        creada_en: expect.any(String)
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/documentos'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.any(String)
          }),
          body: expect.any(String)
        })
      );
    });

    test('debe manejar errores de SIGO API', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Error de validación')
      });

      await expect(
        facturaService.crearFacturaDesdeWebhook(mockWebhookData)
      ).rejects.toThrow('Error al crear factura en SIGO: Error de validación');
    });

    test('debe manejar errores de red', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        facturaService.crearFacturaDesdeWebhook(mockWebhookData)
      ).rejects.toThrow('Error al crear factura en SIGO: Network error');
    });
  });

  describe('Validaciones', () => {
    test('debe validar datos obligatorios', () => {
      const datosIncompletos = {
        order_id: 123,
        // Faltan otros campos obligatorios
      };

      expect(() => {
        facturaService.transformarDatosParaSigo(datosIncompletos);
      }).toThrow();
    });

    test('debe validar formato de montos', () => {
      const datosConMontoInvalido = {
        ...mockWebhookData,
        amount: 'invalid'
      };

      expect(() => {
        facturaService.transformarDatosParaSigo(datosConMontoInvalido);
      }).toThrow();
    });

    test('debe validar items no vacíos', () => {
      const datosSinItems = {
        ...mockWebhookData,
        items: []
      };

      expect(() => {
        facturaService.transformarDatosParaSigo(datosSinItems);
      }).toThrow();
    });
  });
});
