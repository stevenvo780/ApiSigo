const sigoService = require('./sigoService');

/**
 * Clase personalizada para errores de SIGO API
 */
class SigoApiError extends Error {
  constructor(message, statusCode, originalError) {
    super(message);
    this.name = 'SigoApiError';
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

/**
 * Clase para errores de validación
 */
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Servicio para crear facturas desde webhooks de Hub Central
 */
class FacturaService {
  constructor() {
    this.sigoService = sigoService;
  }

  /**
   * Crear factura en SIGO basada en datos de webhook pedido.pagado
   * @param {Object} orderData - Datos del pedido desde Hub Central
   * @returns {Object} Resultado de la creación de factura
   */
  async crearFacturaDesdeWebhook(orderData) {
    try {
      // Validar datos requeridos
      this.validateOrderData(orderData);

      // Transformar datos de Graf/Hub Central a formato SIGO
      const facturaData = this.transformarDatosParaSigo(orderData);

      // Crear factura en SIGO
      const sigoResponse = await this.sigoService.createInvoice(facturaData);

      // Formatear respuesta
      return {
        factura_id: this.generarFacturaId(orderData.order_id),
        documento_sigo_id: sigoResponse.documentoId || sigoResponse.id,
        estado: 'generada',
        pdf_url: sigoResponse.pdfUrl || `${process.env.SIGO_API_URL}/documents/${sigoResponse.id}/pdf`,
        sigo_raw_response: sigoResponse
      };

    } catch (error) {
      console.error('Error creando factura desde webhook:', error);
      
      if (error.response?.status) {
        throw new SigoApiError(
          `Error en SIGO API: ${error.response.data?.message || error.message}`,
          error.response.status,
          error
        );
      }
      
      throw error;
    }
  }

  /**
   * Validar que los datos del pedido sean correctos
   * @param {Object} orderData - Datos del pedido
   */
  validateOrderData(orderData) {
    const required = ['order_id', 'amount', 'items', 'paid_at'];
    
    for (const field of required) {
      if (!orderData[field]) {
        throw new ValidationError(`Campo requerido faltante: ${field}`, field);
      }
    }

    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
      throw new ValidationError('Debe incluir al menos un item', 'items');
    }

    if (orderData.amount <= 0) {
      throw new ValidationError('El monto debe ser mayor a 0', 'amount');
    }

    // Validar items
    orderData.items.forEach((item, index) => {
      if (!item.product_name || !item.quantity || !item.unit_price) {
        throw new ValidationError(`Item ${index} tiene datos incompletos`, `items[${index}]`);
      }
    });
  }

  /**
   * Transformar datos de webhook de Graf a formato SIGO (Colombia)
   * @param {Object} webhookData - Datos del webhook
   * @returns {Object} Datos formateados para SIGO Colombia
   */
  transformarDatosParaSigo(webhookData) {
    const { order_id, store_id, customer_id, user_id, amount, currency, items, paid_at } = webhookData;
    
    // Convertir timestamp a fecha/hora
    const fechaPago = new Date(paid_at);
    const fechaEmision = fechaPago.toISOString().split('T')[0];
    const horaEmision = fechaPago.toTimeString().split(' ')[0];
    
    // Generar número correlativo único
    const numeroCorrelativo = this.generarNumeroCorrelativo();
    
    // Convertir centavos a pesos colombianos
    const montoEnCOP = amount / 100;
    
    // Procesar items
    const itemsFactura = items.map(item => {
      const valorTotalItem = item.total / 100; // Convertir centavos a COP
      const precioUnitario = item.unit_price / 100;
      
      const calculoIVA = this.calcularIVA(valorTotalItem);
      
      return {
        codigo_producto: `GRAF-${item.product_id}`,
        descripcion: item.product_name,
        cantidad: item.quantity,
        unidad_medida: 'UND',
        valor_unitario: Math.round(calculoIVA.valorSinIVA / item.quantity * 100) / 100,
        precio_unitario: precioUnitario,
        valor_total: calculoIVA.valorSinIVA,
        iva_total: calculoIVA.iva,
        precio_total: valorTotalItem
      };
    });
    
    const resumenFactura = this.calcularResumen(itemsFactura);
    
    return {
      tipo_documento: 'FACTURA_VENTA',
      serie: process.env.SIGO_SERIE_DEFAULT || 'FV',
      numero_correlativo: numeroCorrelativo,
      fecha_emision: fechaEmision,
      hora_emision: horaEmision,
      cliente: {
        tipo_documento: 'NIT',
        numero_documento: process.env.SIGO_NIT_GENERICO || '900123456-1',
        razon_social: 'Cliente Graf Colombia'
      },
      moneda: 'COP',
      items: itemsFactura,
      resumen: resumenFactura,
      referencia_externa: {
        orden_graf: order_id,
        tienda_graf: store_id,
        pagado_en: paid_at
      }
    };
  }

  /**
   * Obtener RUC del cliente (con fallback a genérico)
   */
  obtenerRucCliente(orderData) {
    // En producción, esto vendría de la base de datos del cliente
    // Por ahora usamos un RUC genérico o el que venga en los datos
    return orderData.customer_ruc || process.env.SIGO_RUC_GENERICO || '20000000001';
  }

  /**
   * Obtener razón social del cliente
   */
  obtenerRazonSocialCliente(orderData) {
    return orderData.customer_name || 
           `Cliente Graf ${orderData.customer_id}` || 
           'Cliente Genérico';
  }

  /**
   * Obtener dirección del cliente
   */
  obtenerDireccionCliente(orderData) {
    return orderData.shipping_address?.address || 
           'Dirección no especificada';
  }

  /**
   * Calcular subtotal (sin IVA) para Colombia
   */
  calcularSubtotal(items) {
    const total = items.reduce((sum, item) => {
      return sum + (item.total || (item.quantity * item.unit_price));
    }, 0);
    
    // IVA 19% en Colombia
    return Math.round((total / 1.19) * 100) / 100;
  }

  /**
   * Calcular IVA (19%) para Colombia
   */
  calcularIVA(valorTotal) {
    // Si es un array de items, calcular el total primero
    if (Array.isArray(valorTotal)) {
      const total = valorTotal.reduce((sum, item) => {
        return sum + (item.total || (item.quantity * item.unit_price));
      }, 0);
      valorTotal = total;
    }
    
    // Calcular IVA 19% Colombia
    const valorSinIVA = valorTotal / 1.19;
    const iva = valorTotal - valorSinIVA;
    
    return {
      valorSinIVA: Math.round(valorSinIVA * 100) / 100,
      iva: Math.round(iva * 100) / 100
    };
  }

  /**
   * Calcular resumen total de la factura
   */
  calcularResumen(itemsFactura) {
    const subtotal = itemsFactura.reduce((sum, item) => sum + item.valor_total, 0);
    const iva = itemsFactura.reduce((sum, item) => sum + item.iva_total, 0);
    const total = itemsFactura.reduce((sum, item) => sum + item.precio_total, 0);
    
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,  
      total: Math.round(total * 100) / 100
    };
  }

  /**
   * Generar ID único de factura
   */
  generarFacturaId(orderId) {
    const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `FACT-${orderId}-${fecha}`;
  }

  /**
   * Generar número correlativo (mock - en producción usar BD)
   */
  generarNumeroCorrelativo() {
    // En producción esto debería ser un contador en base de datos
    return Math.floor(Date.now() / 1000) % 100000;
  }
}

module.exports = new FacturaService();
