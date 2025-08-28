import { sigoService } from "./sigoService";
import {
  WebhookOrderData,
  SigoInvoiceData,
  FacturaServiceResponse,
  SigoInvoiceItem,
  SigoInvoiceSummary,
} from "@/types";

/**
 * Clase personalizada para errores de SIGO API
 */
export class SigoApiError extends Error {
  public readonly name = "SigoApiError";
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
  public readonly name = "ValidationError";
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
  // Public API expected by tests (no-op here)

  /**
   * Crear factura en SIGO basada en datos de webhook pedido.pagado
   */
  async crearFacturaDesdeWebhook(
    orderData: WebhookOrderData,
    sigoCredentials?: { apiKey?: string; username?: string },
  ): Promise<FacturaServiceResponse> {
    const errores = this.validateOrderData(orderData);
    if (errores.length > 0) {
      return { success: false, errores } as any;
    }

    try {
      const facturaData: any = this.transformarDatosParaSigo(orderData);
      const sigoResponse = await (sigoService as any).createInvoice(
        facturaData,
        sigoCredentials,
      );

      return {
        success: true,
        factura_id: this.generarFacturaId(orderData.order_id),
        sigo_id: sigoResponse?.id || sigoResponse?.sigo_id,
        serie: facturaData.serie || "FV",
        numero: String(
          sigoResponse?.numero || sigoResponse?.numero_documento || "001",
        ),
        estado: sigoResponse?.estado || "CREADO",
        mensaje: "Factura creada exitosamente desde webhook",
        datos_transformados: facturaData,
        numero_factura: sigoResponse?.numero_documento || "PENDING",
        pdf_url: sigoResponse?.pdfUrl || sigoResponse?.pdf_url,
        xml_url: sigoResponse?.xmlUrl || sigoResponse?.xml_url,
      } as any;
    } catch (error: any) {
      return {
        success: false,
        errores: [
          `Error comunicándose con SIGO: ${error?.message || "Error desconocido"}`,
        ],
      } as any;
    }
  }

  /**
   * Validar que los datos del pedido sean correctos
   */
  public validateOrderData(orderData: WebhookOrderData): string[] {
    const errors: string[] = [];
    const hasOrderId = (orderData as any).order_id || (orderData as any).id;
    const total = (orderData as any).amount ?? (orderData as any).total;
    const paidAt =
      (orderData as any).paid_at ?? (orderData as any).fechaCreacion;

    if (!hasOrderId) errors.push("Campo requerido faltante: order_id");
    if (!paidAt) errors.push("Campo requerido faltante: paid_at");

    const itemsAny = (orderData as any).items;
    if (!Array.isArray(itemsAny) || itemsAny.length === 0) {
      errors.push("Debe incluir al menos un item");
    }
    if (total === undefined || total <= 0) {
      errors.push("Total debe ser mayor a 0");
    }

    const tipoDoc = (orderData as any).customer?.tipoDocumento;
    const numeroDoc = (orderData as any).customer?.numeroDocumento;
    if (tipoDoc && !["RUC", "DNI", "CE", "NIT", "CC", "PASAPORTE"].includes(tipoDoc)) {
      errors.push("Tipo de documento inválido");
    }
    if (numeroDoc === "" || numeroDoc === undefined) {
      errors.push("Número de documento del cliente es requerido");
    }

    return errors;
  }

  /**
   * Validar datos con resultado detallado
   */
  private validateOrderDataWithResult(orderData: WebhookOrderData): any {
    const errors: any[] = [];
    const required = ["order_id", "amount", "items", "paid_at"] as const;

    for (const field of required) {
      if (!orderData[field]) {
        errors.push({
          message: `Campo requerido faltante: ${field}`,
          field,
          code: "REQUIRED_FIELD_MISSING",
          value: orderData[field],
        });
      }
    }

    if (!Array.isArray(orderData.items)) {
      errors.push({
        message: "Items debe ser un array",
        field: "items",
        code: "INVALID_TYPE",
        value: orderData.items,
      });
    } else if (orderData.items.length === 0) {
      errors.push({
        message: "Debe incluir al menos un item",
        field: "items",
        code: "EMPTY_ARRAY",
        value: orderData.items,
      });
    } else {
      orderData.items.forEach((item, index) => {
        if (!item.product_name) {
          errors.push({
            message: `Item ${index} falta product_name`,
            field: `items[${index}].product_name`,
            value: item.product_name,
          });
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push({
            message: `Item ${index} falta quantity válida`,
            field: `items[${index}].quantity`,
            value: item.quantity,
          });
        }
        if (!item.unit_price || item.unit_price <= 0) {
          errors.push({
            message: `Item ${index} falta unit_price válido`,
            field: `items[${index}].unit_price`,
            value: item.unit_price,
          });
        }
      });
    }

    if (orderData.amount !== undefined && orderData.amount <= 0) {
      errors.push({
        message: "El monto debe ser mayor a 0",
        field: "amount",
        value: orderData.amount,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Transformar datos de webhook de Graf a formato SIGO (Colombia)
   */
  public transformarDatosParaSigo(webhookData: WebhookOrderData): any {
    const { order_id, store_id, amount, currency, items, paid_at } =
      webhookData;
    const fechaPago = new Date(paid_at);
    const fechaEmision = isNaN(fechaPago.getTime())
      ? new Date().toISOString().split("T")[0]
      : fechaPago.toISOString().split("T")[0];

    const transformedItems = (items as any[]).map((item: any) => ({
      codigo: item.product_id ? String(item.product_id) : item.sku,
      descripcion: item.product_name || item.descripcion || item.nombre,
      cantidad: item.quantity || item.cantidad,
      precio_unitario:
        Math.round((((item.unit_price ?? item.precioUnitario) / 100) * 100)) /
        100,
      descuento: 0,
      subtotal:
        Math.round(
          ((((item.unit_price ?? item.precioUnitario) * (item.quantity ?? item.cantidad)) / 100) *
            100),
        ) / 100,
      impuesto_iva:
        Math.round(
          ((((item.total ?? (item.precioUnitario * item.cantidad)) - (item.unit_price ?? item.precioUnitario) * (item.quantity ?? item.cantidad)) /
            100) * 100),
        ) / 100,
      total:
        Math.round(
          ((((item.total ?? (item.precioUnitario * item.cantidad)) / 100) * 100)),
        ) / 100,
    }));

    const resumen = this.calcularResumen(transformedItems as any);

    return {
      tipo_documento: "FACTURA_VENTA",
      serie: process.env.SIGO_SERIE_DEFAULT || "FV",
      numero: this.generarNumeroCorrelativoUnico(),
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaEmision,
      moneda: "COP",
      cliente: {
        tipo_documento: (webhookData as any).customer?.tipoDocumento || "NIT",
        numero_documento:
          (webhookData as any).customer?.numeroDocumento ||
          process.env.SIGO_NIT_GENERICO ||
          "900123456-1",
        razon_social:
          (webhookData as any).customer?.razonSocial ||
          this.obtenerRazonSocialCliente(webhookData),
        email: (webhookData as any).customer?.email,
        telefono: (webhookData as any).customer?.telefono,
        direccion:
          (webhookData as any).customer?.direccion?.direccion ||
          this.obtenerDireccionCliente(webhookData),
        ciudad: (webhookData as any).customer?.direccion?.ciudad,
        departamento: (webhookData as any).customer?.direccion?.departamento,
        codigo_postal: (webhookData as any).customer?.direccion?.codigoPostal,
        pais: "CO",
      },
      items: transformedItems,
      totales: {
        subtotal: resumen.subtotal,
        descuentos: 0,
        iva: resumen.impuestos,
        total: resumen.total,
      },
      metadatos: {
        orden_origen: String(order_id),
        canal: "web",
      },
    };
  }

  /**
   * Obtener RUC del cliente (con fallback a genérico)
   */
  private obtenerRucCliente(orderData: WebhookOrderData): string {
    return (
      orderData.customer_ruc || process.env.SIGO_RUC_GENERICO || "20000000001"
    );
  }

  /**
   * Obtener razón social del cliente
   */
  private obtenerRazonSocialCliente(orderData: WebhookOrderData): string {
    return (
      orderData.customer_name ||
      `Cliente Graf ${orderData.customer_id}` ||
      "Cliente Genérico"
    );
  }

  /**
   * Obtener dirección del cliente
   */
  private obtenerDireccionCliente(orderData: WebhookOrderData): string {
    return orderData.shipping_address?.address || "Dirección no especificada";
  }

  /**
   * Calcular subtotal (sin IVA) para Colombia
   */
  private calcularSubtotal(
    items: Array<{ total?: number; quantity: number; unit_price: number }>,
  ): number {
    const total = items.reduce((sum, item) => {
      return sum + (item.total || item.quantity * item.unit_price);
    }, 0);

    return Math.round((total / 1.19) * 100) / 100;
  }

  /**
   * Calcular IVA (19%) para Colombia
   */
  public calcularIVA(base: number): number {
    return Math.round(base * 0.19 * 100) / 100;
  }

  /**
   * Calcular resumen total de la factura
   */
  public calcularResumen(
    items: Array<{
      precioUnitario: number;
      cantidad: number;
      impuestos: number;
    }>,
  ): any {
    const subtotal = items.reduce(
      (sum, i) => sum + i.precioUnitario * i.cantidad,
      0,
    );
    const impuestos = items.reduce((sum, i) => sum + i.impuestos, 0);
    const total = subtotal + impuestos;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      impuestos: Math.round(impuestos * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  /**
   * Generar ID único de factura
   */
  private generarFacturaId(_orderId: number): string {
    const d = new Date();
    const yyyymmdd = d.toISOString().split("T")[0].replace(/-/g, "");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `FACT-${yyyymmdd}-${hh}${mm}${ss}`;
  }

  /**
   * Generar número correlativo
   */
  private generarNumeroCorrelativo(): number {
    return Math.floor(Date.now() / 1000) % 100000;
  }

  /**
   * Generar número correlativo único con timestamp
   */
  private generarNumeroCorrelativoUnico(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Convertir centavos a pesos
   */
  private centavosToPesos(centavos: number): number {
    return Math.round((centavos / 100) * 100) / 100;
  }

  /**
   * Convertir pesos a centavos
   */
  private pesosToCentavos(pesos: number): number {
    return Math.round(pesos * 100);
  }

  /**
   * Formatear moneda colombiana
   */
  private formatearMonedaCOP(valor: number): string {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 2,
    }).format(valor);
  }

  /**
   * Validar NIT colombiano (básico)
   */
  private validarNIT(nit: string): boolean {
    const nitRegex = /^\d{9,10}-?\d$/;
    return nitRegex.test(nit);
  }

  /**
   * Limpiar y formatear NIT
   */
  private formatearNIT(nit: string): string {
    const cleaned = nit.replace(/[^\d-]/g, "");

    if (!cleaned.includes("-") && cleaned.length >= 2) {
      return cleaned.slice(0, -1) + "-" + cleaned.slice(-1);
    }

    return cleaned;
  }
}

export const facturaService = new FacturaService();
export default facturaService;
