import axios from 'axios';
import {
  SigoConfig,
  SigoInvoiceData,
  SigoApiResponse,
  SigoClient,
  InvoiceStatus,
  HealthCheckResult
} from '@/types';

export interface CreateClientData {
  razonSocial: string;
  ruc?: string;
  nit?: string;
  direccion: string;
  email?: string;
  telefono?: string;
  tipoDocumento?: string;
  estado?: string;
}

export interface UpdateClientData {
  razonSocial?: string;
  direccion?: string;
  email?: string;
  telefono?: string;
  estado?: string;
}

export interface InvoiceTotals {
  subtotal: number;
  igv?: number;
  iva?: number;
  total: number;
}

export interface InvoiceItem {
  codigo?: string;
  sku?: string;
  descripcion?: string;
  title?: string;
  cantidad?: number;
  quantity?: number;
  precioUnitario?: number;
  price?: number;
  valorUnitario?: number;
  iva_porcentaje?: number;
  iva_valor?: number;
  total?: number;
}

export interface CreateInvoiceData {
  tipoDocumento?: string;
  serie?: string;
  numero?: number;
  fechaEmision?: string;
  fechaVencimiento?: string;
  moneda?: string;
  cliente: {
    ruc?: string;
    nit?: string;
    razonSocial: string;
    direccion?: string;
    email?: string;
    telefono?: string;
    tipo_documento?: string;
  };
  items: InvoiceItem[];
  totales?: InvoiceTotals;
  observaciones?: string;
  orderId?: string | number;
  metadata?: {
    source?: string;
    orderId?: string | number;
    timestamp?: string;
    [key: string]: any;
  };
}

/**
 * Servicio para interactuar con la API de SIGO
 */
export class SigoService {
  private client: any;
  private baseURL: string;
  private apiKey?: string;
  private username?: string;
  private password?: string;
  private ivaRate: number;
  private defaultCurrency: string;
  private defaultSerie: string;

  constructor() {
    this.baseURL = process.env.SIGO_API_URL || 'https://api.sigosoftware.com';
    this.apiKey = process.env.SIGO_API_KEY;
    this.username = process.env.SIGO_USERNAME;
    this.password = process.env.SIGO_PASSWORD;
    
    // Configuraciones específicas de Colombia
    this.ivaRate = parseFloat(process.env.IVA_COLOMBIA || '19');
    this.defaultCurrency = process.env.MONEDA_DEFAULT || 'COP';
    this.defaultSerie = process.env.SIGO_SERIE_DEFAULT || 'FV';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      }
    });

    this.setupInterceptors();
  }

  /**
   * Configurar interceptores de respuesta
   */
  private setupInterceptors(): void {
    this.client.interceptors.response.use(
      (response: any) => response,
      (error: any) => {
        console.error('SIGO API Error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url
        });
        throw error;
      }
    );
  }

  /**
   * Autenticar con SIGO API
   */
  async authenticate(): Promise<any> {
    try {
      const response = await this.client.post('/auth/login', {
        username: this.username,
        password: this.password
      });
      
      if (response.data.token) {
        this.client.defaults.headers['Authorization'] = `Bearer ${response.data.token}`;
      }
      
      return response.data;
    } catch (error) {
      throw new Error(`Error de autenticación: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Crear cliente en SIGO
   */
  async createClient(clientData: CreateClientData): Promise<any> {
    try {
      const response = await this.client.post('/clientes', {
        razon_social: clientData.razonSocial,
        ruc: clientData.ruc || clientData.nit,
        direccion: clientData.direccion,
        email: clientData.email,
        telefono: clientData.telefono,
        tipo_documento: clientData.tipoDocumento || '6',
        estado: clientData.estado || 'ACTIVO'
      });
      
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error creando cliente: ${message}`);
    }
  }

  /**
   * Obtener cliente por RUC/NIT
   */
  async getClient(ruc: string): Promise<any> {
    try {
      const response = await this.client.get(`/clientes/${ruc}`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error obteniendo cliente: ${message}`);
    }
  }

  /**
   * Actualizar cliente
   */
  async updateClient(ruc: string, clientData: UpdateClientData): Promise<any> {
    try {
      const response = await this.client.put(`/clientes/${ruc}`, {
        razon_social: clientData.razonSocial,
        direccion: clientData.direccion,
        email: clientData.email,
        telefono: clientData.telefono,
        estado: clientData.estado
      });
      
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error actualizando cliente: ${message}`);
    }
  }

  /**
   * Crear factura en SIGO
   */
  async createInvoice(invoiceData: CreateInvoiceData | SigoInvoiceData): Promise<SigoApiResponse> {
    try {
      // Detectar si es formato SIGO nativo o formato estándar
      const isSigoFormat = 'tipo_documento' in invoiceData;
      
      let payload: any;
      
      if (isSigoFormat) {
        // Formato SIGO nativo
        const sigoData = invoiceData as SigoInvoiceData;
        payload = {
          tipo_documento: sigoData.tipo_documento || process.env.TIPO_DOCUMENTO_FACTURA || '01',
          serie: sigoData.serie || this.defaultSerie,
          numero: sigoData.numero_correlativo,
          fecha_emision: sigoData.fecha_emision || new Date().toISOString().split('T')[0],
          moneda: sigoData.moneda || this.defaultCurrency,
          cliente: {
            nit: sigoData.cliente.numero_documento,
            razon_social: sigoData.cliente.razon_social,
            direccion: sigoData.cliente.direccion,
            tipo_documento: sigoData.cliente.tipo_documento || process.env.TIPO_DOCUMENTO_CLIENTE || '31'
          },
          items: sigoData.items.map(item => ({
            codigo: item.codigo_producto,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            valor_unitario: item.valor_unitario,
            iva_porcentaje: this.ivaRate,
            iva_valor: item.iva_total,
            total: item.precio_total
          })),
          totales: {
            subtotal: sigoData.resumen.subtotal,
            iva: sigoData.resumen.iva,
            total: sigoData.resumen.total
          },
          observaciones: 'Factura generada automáticamente desde Hub Central',
          metadata: {
            source: 'hub-central',
            orderId: sigoData.referencia_externa.orden_graf,
            timestamp: new Date().toISOString()
          }
        };
      } else {
        // Formato estándar
        const stdData = invoiceData as CreateInvoiceData;
        
        // Calcular totales con IVA colombiano si no están presentes
        const subtotal = stdData.totales?.subtotal || this.calculateSubtotal(stdData.items);
        const iva = stdData.totales?.iva || stdData.totales?.igv || (subtotal * this.ivaRate / 100);
        const total = stdData.totales?.total || (subtotal + iva);

        payload = {
          tipo_documento: stdData.tipoDocumento || process.env.TIPO_DOCUMENTO_FACTURA || '01',
          serie: stdData.serie || this.defaultSerie,
          numero: stdData.numero,
          fecha_emision: stdData.fechaEmision || new Date().toISOString().split('T')[0],
          fecha_vencimiento: stdData.fechaVencimiento,
          moneda: stdData.moneda || this.defaultCurrency,
          cliente: {
            nit: stdData.cliente.ruc || stdData.cliente.nit,
            razon_social: stdData.cliente.razonSocial,
            direccion: stdData.cliente.direccion,
            email: stdData.cliente.email,
            telefono: stdData.cliente.telefono,
            tipo_documento: stdData.cliente.tipo_documento || process.env.TIPO_DOCUMENTO_CLIENTE || '31'
          },
          items: stdData.items.map(item => ({
            codigo: item.codigo || item.sku || 'PROD001',
            descripcion: item.descripcion || item.title,
            cantidad: item.cantidad || item.quantity,
            precio_unitario: item.precioUnitario || item.price,
            valor_unitario: item.valorUnitario || item.price,
            iva_porcentaje: this.ivaRate,
            iva_valor: (item.precioUnitario || item.price || 0) * (item.cantidad || item.quantity || 0) * this.ivaRate / 100,
            total: (item.precioUnitario || item.price || 0) * (item.cantidad || item.quantity || 0) * (1 + this.ivaRate / 100)
          })),
          totales: {
            subtotal: subtotal,
            iva: iva,
            total: total
          },
          observaciones: stdData.observaciones || 'Factura generada automáticamente desde Hub Central',
          metadata: {
            source: 'hub-central',
            orderId: stdData.orderId,
            timestamp: new Date().toISOString(),
            ...stdData.metadata
          }
        };
      }
      
      console.log(`✅ Creando factura en SIGO: ${payload.serie}-${payload.numero}`);
      const response = await this.client.post('/facturas', payload);
      
      console.log(`✅ Factura creada en SIGO: ${payload.serie}-${payload.numero}`);
      return response.data;
    } catch (error: any) {
      console.error(`❌ Error creando factura en SIGO:`, error.response?.data || error.message);
      throw new Error(`Error creando factura: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Método auxiliar para calcular subtotal
   */
  private calculateSubtotal(items: InvoiceItem[]): number {
    return items.reduce((sum, item) => {
      const price = item.precioUnitario || item.price || 0;
      const quantity = item.cantidad || item.quantity || 0;
      return sum + (price * quantity);
    }, 0);
  }

  /**
   * Obtener factura por serie y número
   */
  async getInvoice(serie: string, numero: string | number): Promise<any> {
    try {
      const response = await this.client.get(`/facturas/${serie}/${numero}`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error obteniendo factura: ${message}`);
    }
  }

  /**
   * Actualizar estado de factura
   */
  async updateInvoiceStatus(serie: string, numero: string | number, status: InvoiceStatus): Promise<any> {
    try {
      const response = await this.client.patch(`/facturas/${serie}/${numero}/estado`, {
        estado: status
      });
      
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error actualizando estado de factura: ${message}`);
    }
  }

  /**
   * Enviar factura a SUNAT/DIAN
   */
  async sendInvoiceToSunat(serie: string, numero: string | number): Promise<any> {
    try {
      const response = await this.client.post(`/facturas/${serie}/${numero}/enviar-sunat`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error enviando factura a SUNAT: ${message}`);
    }
  }

  /**
   * Anular factura
   */
  async cancelInvoice(serie: string, numero: string | number, motivo: string): Promise<any> {
    try {
      const response = await this.client.post(`/facturas/${serie}/${numero}/anular`, {
        motivo: motivo
      });
      
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error anulando factura: ${message}`);
    }
  }

  /**
   * Obtener estado de factura
   */
  async getInvoiceStatus(serie: string, numero: string | number): Promise<any> {
    try {
      const response = await this.client.get(`/facturas/${serie}/${numero}/estado`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error obteniendo estado de factura: ${message}`);
    }
  }

  /**
   * Health check del servicio SIGO
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      
      // Intentar hacer una petición simple para verificar conectividad
      await this.client.get('/health', { timeout: 5000 }).catch(() => {
        // Si /health no existe, intentar con /status o /
        return this.client.get('/status', { timeout: 5000 }).catch(() => {
          return this.client.get('/', { timeout: 5000 });
        });
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          sigo: true
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          sigo: false
        },
        errors: [
          error instanceof Error ? error.message : 'Unknown error connecting to SIGO'
        ]
      };
    }
  }

  /**
   * Obtener configuración actual
   */
  getConfig(): SigoConfig {
    return {
      baseURL: this.baseURL,
      apiKey: this.apiKey || '',
      username: this.username,
      password: this.password ? '***' : undefined,
      ivaRate: this.ivaRate,
      defaultCurrency: this.defaultCurrency,
      defaultSerie: this.defaultSerie,
      timeout: 30000
    };
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<SigoConfig>): void {
    if (config.baseURL) {
      this.baseURL = config.baseURL;
      this.client.defaults.baseURL = config.baseURL;
    }
    
    if (config.apiKey) {
      this.apiKey = config.apiKey;
      this.client.defaults.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    
    if (config.timeout) {
      this.client.defaults.timeout = config.timeout;
    }
    
    if (config.ivaRate !== undefined) {
      this.ivaRate = config.ivaRate;
    }
    
    if (config.defaultCurrency) {
      this.defaultCurrency = config.defaultCurrency;
    }
    
    if (config.defaultSerie) {
      this.defaultSerie = config.defaultSerie;
    }
  }

  /**
   * Verificar conectividad con SIGO
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/', { timeout: 10000 });
      return true;
    } catch (error) {
      console.error('Error testing SIGO connection:', error);
      return false;
    }
  }
}

// Exportar instancia singleton
export const sigoService = new SigoService();
export default sigoService;
