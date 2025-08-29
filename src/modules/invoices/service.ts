import axios from "axios";
import config from "@/shared/config";
import type { SigoAuthHeaders } from "@/services/sigoAuthService";

export interface InvoiceItem {
  codigo?: string;
  sku?: string;
  descripcion?: string;
  title?: string;
  cantidad?: number;
  quantity?: number;
  precioUnitario?: number;
  price?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  igv?: number;
  iva?: number;
  total: number;
}

export interface CreateInvoiceData {
  tipoDocumento?: string;
  serie?: string;
  numero?: number;
  fechaEmision?: string;
  fechaVencimiento?: string;
  moneda?: string;
  cliente: {
    id?: string;
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
  metadata?: Record<string, any>;
}

export class InvoiceService {
  private client: any;

  constructor() {
    this.client = axios.create({
      baseURL: config.sigo.baseUrl,
      timeout: config.sigo.timeout,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  async createInvoice(
    data: CreateInvoiceData,
    authHeaders: SigoAuthHeaders,
  ): Promise<any> {
    const sigoPayload: any = {
      document: {
        id: config.sigo.documentId.toString(), // Convertir a string
      },
      date:
        data.fechaEmision ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0], // Fecha de ayer por defecto
      seller: config.sigo.sellerId,
      customer: {
        ...(data.cliente.id ? { id: data.cliente.id } : {}),
        identification: data.cliente.ruc || data.cliente.nit || "999888777", // Fallback válido
        branch_office: 0,
      },
      observations: data.observaciones,
      items: data.items.map((it) => {
        const item: any = {
          description: it.descripcion || it.title || "Producto",
          quantity: it.cantidad ?? it.quantity ?? 1,
          price: it.precioUnitario ?? it.price ?? 0,
          discount: 0,
        };
        const code = it.codigo || it.sku;
        if (code) item.code = code;
        else if (config.sigo.taxId) item.taxes = [{ id: config.sigo.taxId }];
        return item;
      }),
      payments: data.totales?.total
        ? [
            {
              id: config.sigo.paymentMethodId || 0, // Debe configurarse según /v1/payment-types?document_type=FV
              value: data.totales.total,
              due_date:
                data.fechaVencimiento ||
                data.fechaEmision ||
                new Date(Date.now() - 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0], // Fecha de ayer por defecto
            },
          ]
        : [],
      // currency omitida para evitar invalid_currency
    };

    try {
      console.log(
        "[InvoiceService] SIGO Payload:",
        JSON.stringify(sigoPayload, null, 2),
      );
      const response = await this.client.post("/v1/invoices", sigoPayload, {
        headers: authHeaders,
      });
      return response.data;
    } catch (error: any) {
      console.log("[InvoiceService] SIGO API Error:", {
        Status: error.response?.status,
        Errors: error.response?.data?.Errors || error.response?.data,
      });
      throw error;
    }
  }

  async getInvoice(
    _serie: string,
    numero: string | number,
    authHeaders: SigoAuthHeaders,
  ): Promise<any> {
    const res = await this.client.get(
      `/v1/invoices?number=${encodeURIComponent(String(numero))}`,
      { headers: authHeaders },
    );
    const items = res.data?.results || res.data || [];
    return Array.isArray(items) ? items[0] : items;
  }

  async createCreditNoteByInvoiceNumber(
    serie: string,
    numero: string | number,
    authHeaders: SigoAuthHeaders,
    motivo?: string,
  ): Promise<any> {
    const inv = await this.getInvoice(serie, numero, authHeaders);
    if (!inv || !inv.id) {
      throw new Error("Factura no encontrada en Siigo");
    }

    const itemsSrc: any[] = inv.items || inv.document_items || [];
    const cnItems =
      Array.isArray(itemsSrc) && itemsSrc.length > 0
        ? itemsSrc.map((it: any) => ({
            code: it.code || it.codigo || it.product_code,
            description: it.description || it.descripcion || it.name,
            quantity: it.quantity || it.cantidad || 1,
            price: it.price || it.precio_unitario || it.unit_price || 0,
            discount: 0,
            taxes: config.sigo.taxId ? [{ id: config.sigo.taxId }] : undefined,
          }))
        : undefined;

    const payload: any = {
      document: { id: config.sigo.creditNoteDocumentId },
      date: new Date().toISOString().split("T")[0],
      customer: {
        identification:
          inv?.customer?.identification ||
          inv?.customer_identification ||
          inv?.cliente?.nit ||
          inv?.customer_id ||
          "",
        branch_office: 0,
      },
      invoice: { id: inv.id },
      observations: motivo || "Anulación total",
      items: cnItems,
    };

    const response = await this.client.post("/v1/credit-notes", payload, {
      headers: authHeaders,
    });
    return response.data;
  }

  async createInvoiceFromWebhook(
    orderData: any,
    authHeaders: SigoAuthHeaders,
  ): Promise<any> {
    // Validar datos mínimos
    if (!orderData.items || orderData.items.length === 0) {
      throw new Error("No se encontraron items en la orden");
    }

    if (!orderData.amount || orderData.amount <= 0) {
      throw new Error("Monto inválido");
    }

    // Transformar datos del webhook al formato de SIGO
    const invoiceData = {
      fechaEmision: orderData.paid_at
        ? new Date(orderData.paid_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      cliente: {
        razonSocial:
          orderData.customer?.name || `Cliente Orden ${orderData.order_id}`,
        nit: orderData.customer?.identification || "",
        email: orderData.customer?.email,
        telefono: orderData.customer?.phone,
      },
      items: orderData.items.map((item: any) => ({
        descripcion: item.product_name || item.title || "Producto",
        cantidad: item.quantity || 1,
        precioUnitario: item.unit_price || item.price || 0,
      })),
      totales: {
        total: orderData.amount / 100, // Convertir de centavos a unidades
        subtotal: orderData.amount / 100,
      },
      orderId: orderData.order_id,
      observaciones: `Orden desde webhook: ${orderData.order_id}`,
    };

    return await this.createInvoice(invoiceData, authHeaders);
  }
}

// Singleton
let invoiceServiceInstance: InvoiceService | null = null;

export const getInvoiceService = (): InvoiceService => {
  if (!invoiceServiceInstance) {
    invoiceServiceInstance = new InvoiceService();
  }
  return invoiceServiceInstance;
};

export default { getInstance: getInvoiceService };
