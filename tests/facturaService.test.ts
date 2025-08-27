import { FacturaService } from '@/services/facturaService';
import { sigoService } from '@/services/sigoService';
import { webhookService } from '@/services/webhookService';
import { WebhookOrderData, FacturaServiceResponse } from '@/types';


jest.mock('@/services/sigoService', () => ({
  sigoService: {
    createInvoice: jest.fn(),
    createClient: jest.fn(),
    healthCheck: jest.fn()
  }
}));


jest.mock('@/services/webhookService', () => ({
  webhookService: {
    enviarFacturaCreada: jest.fn(),
    enviarError: jest.fn()
  }
}));

describe('FacturaService', () => {
  let facturaService: FacturaService;
  const mockSigoService = sigoService as jest.Mocked<typeof sigoService>;
  const mockWebhookService = webhookService as jest.Mocked<typeof webhookService>;

  beforeEach(() => {
    facturaService = new FacturaService();
    jest.clearAllMocks();
  });

  describe('crearFacturaDesdeWebhook', () => {
    const mockWebhookData: WebhookOrderData = {
      id: 'order_123',
      numero: 'ORD-001',
      total: 118,
      subtotal: 100,
      impuestos: 18,
      moneda: 'COP',
      fechaCreacion: '2024-01-15T10:00:00.000Z',
      estado: 'completed',
      customer: {
        id: 'customer_123',
        tipoDocumento: 'NIT',
        numeroDocumento: '900123456',
        nombres: 'Empresa Test',
        apellidos: '',
        razonSocial: 'Empresa Test SAS',
        email: 'test@empresa.com',
        telefono: '3001234567',
        direccion: {
          direccion: 'Carrera 7 # 123-45',
          ciudad: 'Bogotá',
          departamento: 'Cundinamarca',
          codigoPostal: '110111',
          pais: 'CO'
        }
      },
      items: [
        {
          id: 'item_1',
          nombre: 'Producto Test',
          descripcion: 'Descripción del producto',
          cantidad: 1,
          precioUnitario: 100,
          subtotal: 100,
          impuestos: 18,
          total: 118,
          sku: 'TEST-001'
        }
      ],
      descuentos: [],
      metadatos: {
        canal: 'web'
      }
    };

    it('debería crear una factura exitosamente desde webhook', async () => {
      const mockSigoResponse = {
        success: true,
        id: 'sigo_invoice_123',
        serie: 'FV',
        numero: '001',
        estado: 'CREADO'
      };

      mockSigoService.createInvoice.mockResolvedValue(mockSigoResponse);

      const result = await facturaService.crearFacturaDesdeWebhook(mockWebhookData);

      expect(result).toEqual({
        success: true,
        factura_id: expect.stringMatching(/^FACT-\d{8}-\d{6}$/),
        sigo_id: 'sigo_invoice_123',
        serie: 'FV',
        numero: '001',
        estado: 'CREADO',
        mensaje: 'Factura creada exitosamente desde webhook',
        datos_transformados: expect.any(Object)
      });

      expect(mockSigoService.createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          cliente: expect.objectContaining({
            tipo_documento: 'NIT',
            numero_documento: '900123456',
            razon_social: 'Empresa Test SAS'
          }),
          items: expect.arrayContaining([
            expect.objectContaining({
              descripcion: 'Producto Test',
              cantidad: 1,
              precio_unitario: 100
            })
          ])
        })
      );
    });

    it('debería manejar errores de validación', async () => {
      const invalidData = {
        ...mockWebhookData,
        customer: {
          ...mockWebhookData.customer,
          numeroDocumento: ''
        }
      };

      const result = await facturaService.crearFacturaDesdeWebhook(invalidData);

      expect(result.success).toBe(false);
      expect(result.errores).toContain('Número de documento del cliente es requerido');
      expect(mockSigoService.createInvoice).not.toHaveBeenCalled();
    });

    it('debería calcular correctamente el IVA', async () => {
      const testCases = [
        { base: 100, expectedIva: 19 },
        { base: 200, expectedIva: 38 },
        { base: 50.5, expectedIva: 9.6 }
      ];

      testCases.forEach(testCase => {
        const iva = facturaService.calcularIVA(testCase.base);
        expect(iva).toBeCloseTo(testCase.expectedIva, 2);
      });
    });

    it('debería transformar correctamente los datos para SIGO', () => {
      const transformedData = facturaService.transformarDatosParaSigo(mockWebhookData);

      expect(transformedData).toEqual({
        tipo_documento: 'FACTURA_VENTA',
        serie: 'FV',
        numero: expect.any(Number),
        fecha_emision: expect.any(String),
        fecha_vencimiento: expect.any(String),
        moneda: 'COP',
        cliente: {
          tipo_documento: 'NIT',
          numero_documento: '900123456',
          razon_social: 'Empresa Test SAS',
          email: 'test@empresa.com',
          telefono: '3001234567',
          direccion: 'Carrera 7 # 123-45',
          ciudad: 'Bogotá',
          departamento: 'Cundinamarca',
          codigo_postal: '110111',
          pais: 'CO'
        },
        items: [
          {
            codigo: 'TEST-001',
            descripcion: 'Producto Test',
            cantidad: 1,
            precio_unitario: 100,
            descuento: 0,
            subtotal: 100,
            impuesto_iva: 18,
            total: 118
          }
        ],
        totales: {
          subtotal: 100,
          descuentos: 0,
          iva: 18,
          total: 118
        },
        metadatos: {
          orden_origen: 'order_123',
          canal: 'web'
        }
      });
    });

    it('debería manejar errores de SIGO API', async () => {
      const mockError = new Error('SIGO API Error');
      mockSigoService.createInvoice.mockRejectedValue(mockError);

      const result = await facturaService.crearFacturaDesdeWebhook(mockWebhookData);

      expect(result.success).toBe(false);
      expect(result.errores).toContain('Error comunicándose con SIGO: SIGO API Error');
    });
  });

  describe('validateOrderData', () => {
    it('debería validar correctamente datos válidos', () => {
      const validData: WebhookOrderData = {
        id: 'order_123',
        numero: 'ORD-001',
        total: 100,
        subtotal: 84.03,
        impuestos: 15.97,
        moneda: 'COP',
        fechaCreacion: '2024-01-15T10:00:00.000Z',
        estado: 'completed',
        customer: {
          id: 'customer_123',
          tipoDocumento: 'NIT',
          numeroDocumento: '900123456',
          nombres: 'Test Company',
          razonSocial: 'Test Company SAS',
          email: 'test@test.com'
        },
        items: [
          {
            id: 'item_1',
            nombre: 'Producto',
            cantidad: 1,
            precioUnitario: 84.03,
            subtotal: 84.03,
            impuestos: 15.97,
            total: 100
          }
        ],
        descuentos: []
      };

      const errors = facturaService.validateOrderData(validData);
      expect(errors).toHaveLength(0);
    });

    it('debería detectar errores de validación', () => {
      const invalidData = {

        total: -100,
        customer: {
          tipoDocumento: 'INVALID',
          numeroDocumento: ''
        },
        items: []
      } as any;

      const errors = facturaService.validateOrderData(invalidData);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Total debe ser mayor a 0');
      expect(errors).toContain('Tipo de documento inválido');
      expect(errors).toContain('Número de documento del cliente es requerido');
      expect(errors).toContain('Debe incluir al menos un item');
    });
  });

  describe('calcularResumen', () => {
    it('debería calcular correctamente el resumen de totales', () => {
      const items = [
        { precioUnitario: 100, cantidad: 2, impuestos: 38 },
        { precioUnitario: 50, cantidad: 1, impuestos: 9.5 }
      ];

      const resumen = facturaService.calcularResumen(items as any);

      expect(resumen).toEqual({
        subtotal: 250,
        impuestos: 47.5,
        total: 297.5
      });
    });

    it('debería manejar items vacíos', () => {
      const resumen = facturaService.calcularResumen([]);

      expect(resumen).toEqual({
        subtotal: 0,
        impuestos: 0,
        total: 0
      });
    });
  });
});
