const axios = require('axios');

class SigoService {
  constructor() {
    this.baseURL = process.env.SIGO_API_URL;
    this.apiKey = process.env.SIGO_API_KEY;
    this.username = process.env.SIGO_USERNAME;
    this.password = process.env.SIGO_PASSWORD;
    
    // Configuraciones específicas de Colombia
    this.ivaRate = parseFloat(process.env.IVA_COLOMBIA) || 19;
    this.defaultCurrency = process.env.MONEDA_DEFAULT || 'COP';
    this.defaultSerie = process.env.SIGO_SERIE_DEFAULT || 'FV';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });

    this.client.interceptors.response.use(
      response => response,
      error => {
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

  async authenticate() {
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
      throw new Error(`Error de autenticación: ${error.message}`);
    }
  }

  async createClient(clientData) {
    try {
      const response = await this.client.post('/clientes', {
        razon_social: clientData.razonSocial,
        ruc: clientData.ruc,
        direccion: clientData.direccion,
        email: clientData.email,
        telefono: clientData.telefono,
        tipo_documento: clientData.tipoDocumento || '6',
        estado: clientData.estado || 'ACTIVO'
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Error creando cliente: ${error.response?.data?.message || error.message}`);
    }
  }

  async getClient(ruc) {
    try {
      const response = await this.client.get(`/clientes/${ruc}`);
      return response.data;
    } catch (error) {
      throw new Error(`Error obteniendo cliente: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateClient(ruc, clientData) {
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
      throw new Error(`Error actualizando cliente: ${error.response?.data?.message || error.message}`);
    }
  }

  async createInvoice(invoiceData) {
    try {
      // Calcular totales con IVA colombiano si no están presentes
      const subtotal = invoiceData.totales?.subtotal || this.calculateSubtotal(invoiceData.items);
      const iva = invoiceData.totales?.igv || (subtotal * this.ivaRate / 100);
      const total = invoiceData.totales?.total || (subtotal + iva);

      const response = await this.client.post('/facturas', {
        tipo_documento: invoiceData.tipoDocumento || process.env.TIPO_DOCUMENTO_FACTURA || '01',
        serie: invoiceData.serie || this.defaultSerie,
        numero: invoiceData.numero,
        fecha_emision: invoiceData.fechaEmision || new Date().toISOString().split('T')[0],
        fecha_vencimiento: invoiceData.fechaVencimiento,
        moneda: invoiceData.moneda || this.defaultCurrency,
        cliente: {
          nit: invoiceData.cliente.ruc || invoiceData.cliente.nit,
          razon_social: invoiceData.cliente.razonSocial,
          direccion: invoiceData.cliente.direccion,
          email: invoiceData.cliente.email,
          telefono: invoiceData.cliente.telefono,
          tipo_documento: process.env.TIPO_DOCUMENTO_CLIENTE || '31'
        },
        items: invoiceData.items.map(item => ({
          codigo: item.codigo || item.sku || 'PROD001',
          descripcion: item.descripcion || item.title,
          cantidad: item.cantidad || item.quantity,
          precio_unitario: item.precioUnitario || item.price,
          valor_unitario: item.valorUnitario || item.price,
          iva_porcentaje: this.ivaRate,
          iva_valor: (item.precioUnitario || item.price) * (item.cantidad || item.quantity) * this.ivaRate / 100,
          total: (item.precioUnitario || item.price) * (item.cantidad || item.quantity) * (1 + this.ivaRate / 100)
        })),
        totales: {
          subtotal: subtotal,
          iva: iva,
          total: total
        },
        observaciones: invoiceData.observaciones || 'Factura generada automáticamente desde Hub Central',
        // Metadatos para trazabilidad
        metadata: {
          source: 'hub-central',
          orderId: invoiceData.orderId,
          timestamp: new Date().toISOString()
        }
      });
      
      console.log(`✅ Factura creada en SIGO: ${invoiceData.serie || this.defaultSerie}-${invoiceData.numero}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Error creando factura en SIGO:`, error.response?.data || error.message);
      throw new Error(`Error creando factura: ${error.response?.data?.message || error.message}`);
    }
  }

  // Método auxiliar para calcular subtotal
  calculateSubtotal(items) {
    return items.reduce((sum, item) => {
      const price = item.precioUnitario || item.price || 0;
      const quantity = item.cantidad || item.quantity || 0;
      return sum + (price * quantity);
    }, 0);
  }

  async getInvoice(serie, numero) {
    try {
      const response = await this.client.get(`/facturas/${serie}/${numero}`);
      return response.data;
    } catch (error) {
      throw new Error(`Error obteniendo factura: ${error.response?.data?.message || error.message}`);
    }
  }

  async updateInvoiceStatus(serie, numero, status) {
    try {
      const response = await this.client.patch(`/facturas/${serie}/${numero}/estado`, {
        estado: status
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Error actualizando estado de factura: ${error.response?.data?.message || error.message}`);
    }
  }

  async sendInvoiceToSunat(serie, numero) {
    try {
      const response = await this.client.post(`/facturas/${serie}/${numero}/enviar-sunat`);
      return response.data;
    } catch (error) {
      throw new Error(`Error enviando factura a SUNAT: ${error.response?.data?.message || error.message}`);
    }
  }

  async cancelInvoice(serie, numero, motivo) {
    try {
      const response = await this.client.post(`/facturas/${serie}/${numero}/anular`, {
        motivo: motivo
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Error anulando factura: ${error.response?.data?.message || error.message}`);
    }
  }

  async getInvoiceStatus(serie, numero) {
    try {
      const response = await this.client.get(`/facturas/${serie}/${numero}/estado`);
      return response.data;
    } catch (error) {
      throw new Error(`Error obteniendo estado de factura: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new SigoService();