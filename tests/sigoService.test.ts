import axios from 'axios';
import { SigoService } from '@/services/sigoService';
import { CreateInvoiceData, CreateClientData } from '@/types';


jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SigoService', () => {
  let sigoService: SigoService;
  
  beforeEach(() => {
    sigoService = new SigoService();
    jest.clearAllMocks();
    

    mockedAxios.create.mockReturnValue(mockedAxios);
  });

  describe('createInvoice', () => {
    const mockInvoiceData: CreateInvoiceData = {
      tipo_documento: 'FACTURA_VENTA',
      serie: 'FV',
      numero: 1,
      fecha_emision: '2024-01-15',
      fecha_vencimiento: '2024-02-15',
      moneda: 'COP',
      cliente: {
        tipo_documento: 'NIT',
        numero_documento: '900123456',
        razon_social: 'Test Company SAS',
        email: 'test@company.com',
        telefono: '3001234567',
        direccion: 'Carrera 7 # 123-45',
        ciudad: 'Bogotá',
        departamento: 'Cundinamarca',
        codigo_postal: '110111',
        pais: 'CO'
      },
      items: [
        {
          codigo: 'PROD-001',
          descripcion: 'Producto de prueba',
          cantidad: 1,
          precio_unitario: 100,
          descuento: 0,
          subtotal: 100,
          impuesto_iva: 19,
          total: 119
        }
      ],
      totales: {
        subtotal: 100,
        descuentos: 0,
        iva: 19,
        total: 119
      },
      metadatos: {
        orden_origen: 'test_order_123'
      }
    };

    it('debería crear una factura exitosamente', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: 'sigo_invoice_123',
            serie: 'FV',
            numero: '001',
            estado: 'CREADO',
            fecha_creacion: '2024-01-15T10:00:00Z'
          }
        },
        status: 201
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await sigoService.createInvoice(mockInvoiceData);

      expect(result).toEqual({
        success: true,
        id: 'sigo_invoice_123',
        serie: 'FV',
        numero: '001',
        estado: 'CREADO',
        fecha_creacion: '2024-01-15T10:00:00Z'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/invoices', mockInvoiceData);
    });

    it('debería manejar errores de la API de SIGO', async () => {
      const mockError = {
        response: {
          status: 400,
          data: {
            error: 'Datos inválidos',
            details: ['Serie requerida']
          }
        }
      };

      mockedAxios.post.mockRejectedValue(mockError);

      await expect(sigoService.createInvoice(mockInvoiceData))
        .rejects
        .toThrow('Error creando factura en SIGO: Datos inválidos');
    });

    it('debería manejar errores de conexión', async () => {
      const mockError = new Error('Network Error');
      mockedAxios.post.mockRejectedValue(mockError);

      await expect(sigoService.createInvoice(mockInvoiceData))
        .rejects
        .toThrow('Error comunicándose con SIGO: Network Error');
    });
  });

  describe('createClient', () => {
    const mockClientData: CreateClientData = {
      tipoDocumento: 'NIT',
      numeroDocumento: '900123456',
      razonSocial: 'Test Company SAS',
      email: 'test@company.com',
      telefono: '3001234567',
      direccion: 'Carrera 7 # 123-45',
      ciudad: 'Bogotá',
      departamento: 'Cundinamarca',
      codigoPostal: '110111',
      activo: true
    };

    it('debería crear un cliente exitosamente', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: 'sigo_client_123',
            tipo_documento: 'NIT',
            numero_documento: '900123456',
            razon_social: 'Test Company SAS',
            activo: true
          }
        },
        status: 201
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await sigoService.createClient(mockClientData);

      expect(result).toEqual({
        success: true,
        id: 'sigo_client_123',
        tipo_documento: 'NIT',
        numero_documento: '900123456',
        razon_social: 'Test Company SAS',
        activo: true
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/clients', {
        tipo_documento: 'NIT',
        numero_documento: '900123456',
        razon_social: 'Test Company SAS',
        email: 'test@company.com',
        telefono: '3001234567',
        direccion: 'Carrera 7 # 123-45',
        ciudad: 'Bogotá',
        departamento: 'Cundinamarca',
        codigo_postal: '110111',
        activo: true
      });
    });

    it('debería manejar cliente duplicado', async () => {
      const mockError = {
        response: {
          status: 409,
          data: {
            error: 'Cliente ya existe',
            details: ['El cliente con este documento ya está registrado']
          }
        }
      };

      mockedAxios.post.mockRejectedValue(mockError);

      await expect(sigoService.createClient(mockClientData))
        .rejects
        .toThrow('Error creando cliente en SIGO: Cliente ya existe');
    });
  });

  describe('getInvoice', () => {
    it('debería obtener una factura exitosamente', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: 'sigo_invoice_123',
            serie: 'FV',
            numero: '001',
            estado: 'ENVIADO',
            total: 119
          }
        },
        status: 200
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await sigoService.getInvoice('FV', '001');

      expect(result).toEqual({
        success: true,
        id: 'sigo_invoice_123',
        serie: 'FV',
        numero: '001',
        estado: 'ENVIADO',
        total: 119
      });

      expect(mockedAxios.get).toHaveBeenCalledWith('/invoices/FV/001');
    });

    it('debería manejar factura no encontrada', async () => {
      const mockError = {
        response: {
          status: 404,
          data: {
            error: 'Factura no encontrada'
          }
        }
      };

      mockedAxios.get.mockRejectedValue(mockError);

      await expect(sigoService.getInvoice('FV', '001'))
        .rejects
        .toThrow('Error obteniendo factura de SIGO: Factura no encontrada');
    });
  });

  describe('updateInvoiceStatus', () => {
    it('debería actualizar el estado de una factura', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: 'sigo_invoice_123',
            estado: 'ENVIADO'
          }
        },
        status: 200
      };

      mockedAxios.put.mockResolvedValue(mockResponse);

      const result = await sigoService.updateInvoiceStatus('FV', '001', 'ENVIADO');

      expect(result).toEqual({
        success: true,
        id: 'sigo_invoice_123',
        estado: 'ENVIADO'
      });

      expect(mockedAxios.put).toHaveBeenCalledWith('/invoices/FV/001/status', {
        estado: 'ENVIADO'
      });
    });
  });

  describe('healthCheck', () => {
    it('debería retornar estado saludable', async () => {
      const mockResponse = {
        data: {
          status: 'OK',
          timestamp: '2024-01-15T10:00:00Z',
          version: '1.0.0'
        },
        status: 200
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await sigoService.healthCheck();

      expect(result).toEqual({
        status: 'OK',
        timestamp: '2024-01-15T10:00:00Z',
        version: '1.0.0'
      });

      expect(mockedAxios.get).toHaveBeenCalledWith('/health');
    });

    it('debería manejar servicio no disponible', async () => {
      const mockError = new Error('ECONNREFUSED');
      mockedAxios.get.mockRejectedValue(mockError);

      const result = await sigoService.healthCheck();

      expect(result).toEqual({
        status: 'ERROR',
        error: 'ECONNREFUSED',
        available: false
      });
    });
  });

  describe('sendInvoiceToSunat', () => {
    it('debería enviar factura a DIAN exitosamente', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: 'sigo_invoice_123',
            estado: 'ENVIADO_DIAN',
            cufe: 'test-cufe-123',
            fecha_envio: '2024-01-15T10:00:00Z'
          }
        },
        status: 200
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await sigoService.sendInvoiceToSunat('FV', '001');

      expect(result).toEqual({
        success: true,
        id: 'sigo_invoice_123',
        estado: 'ENVIADO_DIAN',
        cufe: 'test-cufe-123',
        fecha_envio: '2024-01-15T10:00:00Z'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/invoices/FV/001/send-dian');
    });
  });

  describe('cancelInvoice', () => {
    it('debería anular factura exitosamente', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: 'sigo_invoice_123',
            estado: 'ANULADO',
            motivo_anulacion: 'Error en los datos'
          }
        },
        status: 200
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await sigoService.cancelInvoice('FV', '001', 'Error en los datos');

      expect(result).toEqual({
        success: true,
        id: 'sigo_invoice_123',
        estado: 'ANULADO',
        motivo_anulacion: 'Error en los datos'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith('/invoices/FV/001/cancel', {
        motivo: 'Error en los datos'
      });
    });
  });
});
