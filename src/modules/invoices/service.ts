import axios from "axios";
import config from "@/shared/config";
import type { SigoAuthHeaders } from "@/services/sigoAuthService";

export interface InvoiceItem {
  code: string;
  description: string;
  quantity: number;
  price: number;
  discount?: number;
  taxes?: Array<{ id: number }>;
}

export interface InvoicePayment {
  id: number;
  value: number;
  due_date: string;
}

export interface CreateInvoiceData {
  date?: string;
  customer: {
    identification: string;
    branch_office?: number;
  };
  items: InvoiceItem[];
  payments?: InvoicePayment[];
  observations?: string;
}

export interface GrafOrderFromHub {
  id: number;
  status: string;
  store: {
    id: string;
    name: string;
    description?: string;
    owner?: {
      email: string;
    };
  };
  customer?: {
    id?: number;
    name?: string;
    email?: string;
    phone?: string;
    identification?: string;
  };
  user?: {
    id: number;
    email: string;
    name?: string;
  };
  items: GrafOrderItem[];
  amount: {
    total: number;
    discountTotal: number;
    taxTotal: number;
    delivery: number;
  };
  shippingAddress?: {
    address: string;
    apartment?: string;
    buildingName?: string;
    city: string;
    department: string;
    country: string;
    reference?: string;
  };
  customAnswers: {
    question: string;
    answer: string;
  }[];
  deliveryZone?: {
    id: number;
    name: string;
    price: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GrafOrderItem {
  id: number;
  product: {
    id: number;
    title: string;
    description?: string;
    code?: string;
    basePrice: number;
    enabled: boolean;
  };
  quantity: number;
  unitPrice: number;
  finalPrice: number;
}

export const convertGrafOrderToSigoInvoice = (
  grafOrder: GrafOrderFromHub,
): CreateInvoiceData => {
  return {
    date: new Date().toISOString().split("T")[0],
    customer: {
      identification:
        grafOrder.customer?.identification ||
        grafOrder.user?.email ||
        "12345678",
      branch_office: 0,
    },
    items: grafOrder.items.map((item) => ({
      code: item.product.code || `GRAF-${item.product.id}`,
      description: item.product.title,
      quantity: item.quantity,
      price: item.finalPrice,
      discount: 0,
    })),
    observations: `Factura generada desde Graf - Pedido #${grafOrder.id} - Tienda: ${grafOrder.store.name}`,
  };
};

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
        id: config.sigo.documentId, // ID del tipo de documento
      },
      date: data.date || new Date().toISOString().split("T")[0],
      seller: config.sigo.sellerId,
      customer: {
        identification: data.customer.identification,
        branch_office: data.customer.branch_office || 0,
      },
      observations: data.observations,
      items: data.items.map((item) => ({
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount || 0,
        ...(item.taxes && { taxes: item.taxes }),
      })),
      payments: data.payments || [
        {
          id: config.sigo.paymentMethodId || 1,
          value: data.items.reduce(
            (total, item) =>
              total + (item.quantity * item.price - (item.discount || 0)),
            0,
          ),
          due_date: data.date || new Date().toISOString().split("T")[0],
        },
      ],
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

  async getPaymentTypes(
    authHeaders: SigoAuthHeaders,
    documentType: string = "FV",
  ): Promise<any> {
    const response = await this.client.get(
      `/v1/payment-types?document_type=${documentType}`,
      { headers: authHeaders },
    );
    return response.data;
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
