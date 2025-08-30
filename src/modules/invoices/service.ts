import axios from "axios";
import config from "@/shared/config";
import type { SigoAuthHeaders } from "@/services/sigoAuthService";

export interface CreateClientData {
  tipoDocumento: "RUC" | "DNI" | "CE" | "NIT" | "CC";
  numeroDocumento: string;
  razonSocial: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  codigoPostal?: string;
  activo?: boolean;
}

export interface ClientSearchResponse {
  results: any[];
}

interface CustomerForInvoice {
  identification: string;
  branch_office?: number;
}

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
  customer: CustomerForInvoice;
  customerData?: CreateClientData;
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
    documentNumber?: string;
  };
  user?: {
    id: number;
    email: string;
    name?: string;
    documentNumber?: string;
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
  console.log("[convertGrafOrderToSigoInvoice] Received Graf Order:", {
    orderId: grafOrder.id,
    customer: grafOrder.customer,
    user: grafOrder.user
  });
  
  // Create customer data if we have documentNumber from customer OR user
  const documentNumber = grafOrder.customer?.documentNumber || grafOrder.user?.documentNumber;
  const customerData = documentNumber ? {
    tipoDocumento: "CC" as const,
    numeroDocumento: documentNumber,
    razonSocial: grafOrder.customer?.name || grafOrder.user?.name || "Cliente Sin Nombre",
    email: grafOrder.customer?.email || grafOrder.user?.email,
    telefono: grafOrder.customer?.phone,
    direccion: grafOrder.shippingAddress ? 
      `${grafOrder.shippingAddress.address}, ${grafOrder.shippingAddress.city}, ${grafOrder.shippingAddress.department}` : 
      undefined,
    ciudad: grafOrder.shippingAddress?.city,
    departamento: grafOrder.shippingAddress?.department,
  } : undefined;

  const finalIdentification = 
    grafOrder.customer?.documentNumber ||
    grafOrder.user?.documentNumber ||
    "222222222222";
  
  console.log("[convertGrafOrderToSigoInvoice] Final identification:", {
    customerDocumentNumber: grafOrder.customer?.documentNumber,
    userDocumentNumber: grafOrder.user?.documentNumber,
    userEmail: grafOrder.user?.email,
    finalIdentification,
    customerDataWillBeCreated: !!customerData
  });

  return {
    date: new Date().toISOString().split("T")[0],
    customer: {
      identification: finalIdentification,
      branch_office: 0,
    },
    customerData,
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

  async findCustomerByIdentification(
    identification: string,
    authHeaders: SigoAuthHeaders,
  ): Promise<any> {
    try {
      const response = await this.client.get(
        `/v1/customers?identification=${encodeURIComponent(identification)}`,
        { headers: authHeaders }
      );
      const results = response.data?.results || [];
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error("[InvoiceService] Error buscando cliente:", error);
      return null;
    }
  }

  async createCustomer(
    data: CreateClientData,
    authHeaders: SigoAuthHeaders,
  ): Promise<any> {
    const sigoPayload = this.buildSiigoCustomerPayload(data);
    const response = await this.client.post("/v1/customers", sigoPayload, {
      headers: authHeaders,
    });
    return response.data;
  }

  private mapTipoDocumentoToIdType(tipo: string): number {
    const map: Record<string, number> = {
      NIT: 31,
      CC: 13,
      CE: 22,
      DNI: 13,
      RUC: 41,
    };
    return map[tipo] || 31;
  }

  private mapPersonType(tipo: string): "Company" | "Person" {
    return tipo === "NIT" || tipo === "RUC" ? "Company" : "Person";
  }

  private buildSiigoCustomerPayload(data: CreateClientData) {
    const nombreCompleto = data.razonSocial.trim();
    const isCompany = this.mapPersonType(data.tipoDocumento) === "Company";
    const palabras = nombreCompleto.split(" ");

    const sanitize = (s: string) =>
      s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "").toUpperCase();
    const nombre = isCompany
      ? sanitize(palabras[0] || nombreCompleto) || "EMPRESA"
      : palabras[0] || nombreCompleto;
    const apellido = isCompany
      ? sanitize(palabras[1] || "SOCIEDAD") || "SOCIEDAD"
      : palabras.slice(1).join(" ") || nombre;

    return {
      type: "Customer",
      person_type: this.mapPersonType(data.tipoDocumento),
      id_type: this.mapTipoDocumentoToIdType(data.tipoDocumento).toString(),
      identification: data.numeroDocumento,
      name: [nombre, apellido],
      commercial_name: data.razonSocial,
      active: data.activo !== undefined ? data.activo : true,
      vat_responsible: false,
      fiscal_responsibilities: [{ code: "R-99-PN" }],
      address: data.direccion
        ? {
            address: data.direccion,
          }
        : undefined,
      phones: data.telefono
        ? [{ indicative: "57", number: data.telefono }]
        : undefined,
      contacts: data.email
        ? [
            {
              first_name: nombre,
              last_name: apellido,
              email: data.email,
              phone: data.telefono
                ? { indicative: "57", number: data.telefono }
                : undefined,
            },
          ]
        : undefined,
    };
  }

  async createInvoice(
    data: CreateInvoiceData,
    authHeaders: SigoAuthHeaders,
  ): Promise<any> {
    console.log("🔥 [InvoiceService] createInvoice called with data:", {
      customerIdentification: data.customer.identification,
      hasCustomerData: !!data.customerData,
      customerDataDocument: data.customerData?.numeroDocumento
    });
    if (data.customerData && data.customerData.numeroDocumento) {
      const existingCustomer = await this.findCustomerByIdentification(
        data.customerData.numeroDocumento,
        authHeaders
      );
      
      if (!existingCustomer) {
        try {
          console.log("[InvoiceService] Creando cliente antes de facturar:", data.customerData);
          await this.createCustomer(data.customerData, authHeaders);
          console.log("[InvoiceService] Cliente creado exitosamente");
        } catch (error: any) {
          if (
            error?.response?.headers?.["siigoapi-error-code"] === "already_exists"
          ) {
            console.log("[InvoiceService] Cliente ya existe, continuando con la factura");
          } else {
            console.error("[InvoiceService] Error creando cliente:", error);
            throw new Error(`Error creando cliente: ${error.message}`);
          }
        }
      } else {
        console.log("[InvoiceService] Cliente ya existe, usando cliente existente");
      }
    }
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
