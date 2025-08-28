import axios from "axios";
import config from "@/shared/config";
import { defaultLogger as logger } from "@/utils/logger";
import { SigoCredentials } from "@/middleware/sigoCredentials";
import SigoAuthService from "@/services/sigoAuthService";

interface SigoAuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
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

  private async ensureAuth(credentials?: SigoCredentials, authHeaders?: any) {
    // Si ya tenemos headers configurados, úsalos directamente
    if (authHeaders?.Authorization && authHeaders?.["Partner-Id"]) {
      this.client.defaults.headers["Authorization"] = authHeaders.Authorization;
      this.client.defaults.headers["Partner-Id"] = authHeaders["Partner-Id"];
      return;
    }

    // Si no hay headers pero sí credenciales, autenticar
    if (credentials) {
      await SigoAuthService.configureAxiosClient(this.client, credentials);
      return;
    }

    throw new Error("Se requieren credenciales o headers de autenticación");
  }

  async createInvoice(
    data: CreateInvoiceData,
    credentials?: SigoCredentials,
    authHeaders?: any,
  ): Promise<any> {
    await this.ensureAuth(credentials, authHeaders);

    const sigoPayload: any = {
      document: {
        id: config.sigo.documentId,
      },
      date: data.fechaEmision || new Date().toISOString().split("T")[0],
      customer: {
        identification: data.cliente.ruc || data.cliente.nit || "",
        branch_office: 0,
      },
      observations: data.observaciones,
      items: data.items.map((it) => ({
        code: it.codigo || it.sku,
        description: it.descripcion || it.title,
        quantity: it.cantidad ?? it.quantity ?? 1,
        price: it.precioUnitario ?? it.price ?? 0,
        taxes: config.sigo.taxId ? [{ id: config.sigo.taxId }] : undefined,
        discount: 0,
      })),
      payments:
        config.sigo.paymentMethodId && data.totales?.total
          ? [
              {
                payment_method: config.sigo.paymentMethodId,
                value: data.totales.total,
                due_date:
                  data.fechaVencimiento ||
                  data.fechaEmision ||
                  new Date().toISOString().split("T")[0],
              },
            ]
          : undefined,
    };

    const response = await this.client.post("/v1/invoices", sigoPayload);
    return response.data;
  }

  async getInvoice(
    _serie: string,
    numero: string | number,
    credentials?: SigoCredentials,
    authHeaders?: any,
  ): Promise<any> {
    await this.ensureAuth(credentials, authHeaders);
    const res = await this.client.get(
      `/v1/invoices?number=${encodeURIComponent(String(numero))}`,
    );
    const items = res.data?.results || res.data || [];
    return Array.isArray(items) ? items[0] : items;
  }

  async createCreditNoteByInvoiceNumber(
    serie: string,
    numero: string | number,
    credentials?: SigoCredentials,
    motivo?: string,
    authHeaders?: any,
  ): Promise<any> {
    await this.ensureAuth(credentials, authHeaders);

    const inv = await this.getInvoice(serie, numero, credentials, authHeaders);
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

    const response = await this.client.post("/v1/credit-notes", payload);
    return response.data;
  }

  async createInvoiceFromWebhook(
    orderData: any,
    credentials?: SigoCredentials,
    authHeaders?: any,
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

    return await this.createInvoice(invoiceData, credentials, authHeaders);
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
