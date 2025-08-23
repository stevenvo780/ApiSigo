import { sigoService } from './sigoService';
import {
  WebhookOrderData,
  SigoInvoiceData,
  FacturaServiceResponse,
  SigoInvoiceItem,
  SigoInvoiceSummary
} from '@/types';

/**
 * Clase personalizada para errores de SIGO API
 */
export class SigoApiError extends Error {
  public readonly name = 'SigoApiError';
  public readonly statusCode?: number;
  public readonly originalError?: Error;

  constructor(message: string, statusCode?: number, originalError?: Error) {
    super(message);
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

/**
 * Clase para errores de validación
 */
export class ValidationError extends Error {
  public readonly name = 'ValidationError';
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.field = field;
  }
}

/**
 * Servicio para crear facturas desde webhooks de Hub Central
 */
export class FacturaService {
  private sigoService = sigoService;

  /**
   * Crear factura en SIGO basada en datos de webhook pedido.pagado
   */
  async crearFacturaDesdeWebhook(orderData: WebhookOrderData): Promise<FacturaServiceResponse> {
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
        documento_sigo_id: sigoResponse.documentoId || sigoResponse.id || 'UNKNOWN',
        estado: 'generada',
        pdf_url: sigoResponse.pdfUrl || sigoResponse.pdf_url || `${process.env.SIGO_API_URL}/documents/${sigoResponse.id}/pdf`,
        numero_documento: sigoResponse.numero_documento,
        xml_url: sigoResponse.xmlUrl || sigoResponse.xml_url,
        sigo_raw_response: sigoResponse
      };

    } catch (error) {
      console.error('Error creando factura desde webhook:', error);
      
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        throw new SigoApiError(
          `Error en SIGO API: ${axiosError.response?.data?.message || axiosError.message}`,
          axiosError.response?.status,
          axiosError
        );
      }
      
      throw error;
    }
  }

  /**
   * Validar que los datos del pedido sean correctos
   */
  validateOrderData(orderData: WebhookOrderData): void {
    const required: RequiredOrderFields[] = ['order_id', 'amount', 'items', 'paid_at'];
    
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
   * Validar datos con resultado detallado
   */
  validateOrderDataWithResult(orderData: WebhookOrderData): ValidationResult {
    const errors: ValidationErrorData[] = [];
    const required: RequiredOrderFields[] = ['order_id', 'amount', 'items', 'paid_at'];
    
    // Validar campos requeridos
    for (const field of required) {
      if (!orderData[field]) {
        errors.push({
          message: `Campo requerido faltante: ${field}`,
          field,
          value: orderData[field]
        });
      }
    }

    // Validar items
    if (!Array.isArray(orderData.items)) {
      errors.push({
        message: 'Items debe ser un array',
        field: 'items',
        value: orderData.items
      });
    } else if (orderData.items.length === 0) {
      errors.push({
        message: 'Debe incluir al menos un item',
        field: 'items',
        value: orderData.items
      });
    } else {
      // Validar cada item
      orderData.items.forEach((item, index) => {
        if (!item.product_name) {
          errors.push({
            message: `Item ${index} falta product_name`,
            field: `items[${index}].product_name`,
            value: item.product_name
          });
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push({
            message: `Item ${index} falta quantity válida`,
            field: `items[${index}].quantity`,
            value: item.quantity
          });
        }
        if (!item.unit_price || item.unit_price <= 0) {
          errors.push({
            message: `Item ${index} falta unit_price válido`,
            field: `items[${index}].unit_price`,
            value: item.unit_price
          });
        }
      });
    }

    // Validar monto
    if (orderData.amount !== undefined && orderData.amount <= 0) {
      errors.push({
        message: 'El monto debe ser mayor a 0',
        field: 'amount',
        value: orderData.amount
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Transformar datos de webhook de Graf a formato SIGO (Colombia)
   */
  transformarDatosParaSigo(webhookData: WebhookOrderData): SigoInvoiceData {
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
    const itemsFactura: SigoInvoiceItem[] = items.map(item => {
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
        razon_social: this.obtenerRazonSocialCliente(webhookData),
        direccion: this.obtenerDireccionCliente(webhookData)
      },
      moneda: 'COP',
      items: itemsFactura,
      resumen: resumenFactura,
      referencia_externa: {
        orden_graf: order_id,
        tienda_graf: store_id || 1,
        pagado_en: paid_at
      }
    };
  }

  /**
   * Obtener RUC del cliente (con fallback a genérico)
   */
  obtenerRucCliente(orderData: WebhookOrderData): string {
    // En producción, esto vendría de la base de datos del cliente
    // Por ahora usamos un RUC genérico o el que venga en los datos
    return orderData.customer_ruc || process.env.SIGO_RUC_GENERICO || '20000000001';
  }

  /**
   * Obtener razón social del cliente
   */
  obtenerRazonSocialCliente(orderData: WebhookOrderData): string {
    return orderData.customer_name || 
           `Cliente Graf ${orderData.customer_id}` || 
           'Cliente Genérico';
  }

  /**
   * Obtener dirección del cliente
   */
  obtenerDireccionCliente(orderData: WebhookOrderData): string {
    return orderData.shipping_address?.address || 
           'Dirección no especificada';
  }

  /**
   * Calcular subtotal (sin IVA) para Colombia
   */
  calcularSubtotal(items: Array<{ total?: number; quantity: number; unit_price: number }>): number {
    const total = items.reduce((sum, item) => {
      return sum + (item.total || (item.quantity * item.unit_price));
    }, 0);
    
    // IVA 19% en Colombia
    return Math.round((total / 1.19) * 100) / 100;
  }

  /**
   * Calcular IVA (19%) para Colombia
   */
  calcularIVA(valorTotal: number | Array<{ total?: number; quantity: number; unit_price: number }>): TaxCalculation {
    let totalValue: number;

    // Si es un array de items, calcular el total primero
    if (Array.isArray(valorTotal)) {
      totalValue = valorTotal.reduce((sum, item) => {
        return sum + (item.total || (item.quantity * item.unit_price));
      }, 0);
    } else {
      totalValue = valorTotal;
    }
    
    // Calcular IVA 19% Colombia
    const valorSinIVA = totalValue / 1.19;
    const iva = totalValue - valorSinIVA;
    
    return {
      valorSinIVA: Math.round(valorSinIVA * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(totalValue * 100) / 100
    };
  }

  /**
   * Calcular resumen total de la factura
   */
  calcularResumen(itemsFactura: SigoInvoiceItem[]): SigoInvoiceSummary {
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
  generarFacturaId(orderId: number): string {
    const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `FACT-${orderId}-${fecha}`;
  }

  /**
   * Generar número correlativo (mock - en producción usar BD)
   */
  generarNumeroCorrelativo(): number {
    // En producción esto debería ser un contador en base de datos
    return Math.floor(Date.now() / 1000) % 100000;
  }

  /**
   * Generar número correlativo único con timestamp
   */
  generarNumeroCorrelativoUnico(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Convertir centavos a pesos
   */
  centavosToPesos(centavos: number): number {
    return Math.round(centavos / 100 * 100) / 100;
  }

  /**
   * Convertir pesos a centavos
   */
  pesosToCentavos(pesos: number): number {
    return Math.round(pesos * 100);
  }

  /**
   * Formatear moneda colombiana
   */
  formatearMonedaCOP(valor: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 2
    }).format(valor);
  }

  /**
   * Validar NIT colombiano (básico)
   */
  validarNIT(nit: string): boolean {
    // Validación básica de NIT colombiano
    const nitRegex = /^\d{9,10}-?\d$/;
    return nitRegex.test(nit);
  }

  /**
   * Limpiar y formatear NIT
   */
  formatearNIT(nit: string): string {
    // Remover caracteres no numéricos excepto guión
    const cleaned = nit.replace(/[^\d-]/g, '');
    
    // Si no tiene guión, agregarlo antes del último dígito
    if (!cleaned.includes('-') && cleaned.length >= 2) {
      return cleaned.slice(0, -1) + '-' + cleaned.slice(-1);
    }
    
    return cleaned;
  }
}

// Exportar instancia singleton
export const facturaService = new FacturaService();
export default facturaService;
