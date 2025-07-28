const axios = require('axios');

class SigoService {
  constructor() {
    this.baseURL = process.env.SIGO_API_URL;
    this.apiKey = process.env.SIGO_API_KEY;
    this.username = process.env.SIGO_USERNAME;
    this.password = process.env.SIGO_PASSWORD;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('SIGO API Error:', error.response?.data || error.message);
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
      const response = await this.client.post('/facturas', {
        tipo_documento: invoiceData.tipoDocumento || '01',
        serie: invoiceData.serie,
        numero: invoiceData.numero,
        fecha_emision: invoiceData.fechaEmision,
        fecha_vencimiento: invoiceData.fechaVencimiento,
        moneda: invoiceData.moneda || 'PEN',
        cliente: {
          ruc: invoiceData.cliente.ruc,
          razon_social: invoiceData.cliente.razonSocial,
          direccion: invoiceData.cliente.direccion
        },
        items: invoiceData.items.map(item => ({
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precioUnitario,
          valor_unitario: item.valorUnitario,
          igv: item.igv,
          total: item.total
        })),
        totales: {
          subtotal: invoiceData.totales.subtotal,
          igv: invoiceData.totales.igv,
          total: invoiceData.totales.total
        }
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Error creando factura: ${error.response?.data?.message || error.message}`);
    }
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