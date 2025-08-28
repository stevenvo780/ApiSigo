import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Tipos mínimos que usan los controladores
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

// Alias simple para credenciales opcionales
type SigoCredentials = { apiKey?: string; username?: string };

// Servicio simplificado: asume datos ya válidos y minimiza lógica/ruido
export class SigoService {
  private client: any;
  private baseURL: string;
  private apiKey?: string;
  private username?: string;

  constructor() {
    this.baseURL = process.env.SIGO_API_URL || "https://api.siigo.com";
    this.apiKey = process.env.SIGO_API_KEY;
    this.username = process.env.SIGO_USERNAME;

    const defaultTimeout = parseInt(process.env.SIGO_TIMEOUT || "30000", 10);
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: defaultTimeout,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
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
    return {
      person_type: this.mapPersonType(data.tipoDocumento),
      id_type: this.mapTipoDocumentoToIdType(data.tipoDocumento),
      identification: data.numeroDocumento,
      name: data.razonSocial,
      commercial_name: data.razonSocial,
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
              first_name: data.razonSocial,
              email: data.email,
              phone: data.telefono,
            },
          ]
        : undefined,
      active: data.activo !== undefined ? data.activo : true,
    };
  }

  private async ensureAuth(dynamicCredentials?: SigoCredentials) {
    const hasToken = !!this.client.defaults.headers["Authorization"];
    if (!hasToken) await this.authenticate(dynamicCredentials);
  }

  // Autenticación mínima
  async authenticate(dynamicCredentials?: SigoCredentials): Promise<any> {
    const username = dynamicCredentials?.username || this.username;
    const apiKey = dynamicCredentials?.apiKey || this.apiKey;
    if (!username || !apiKey) throw new Error("Credenciales SIGO faltantes");

    const authTimeout = parseInt(process.env.SIGO_AUTH_TIMEOUT || "30000", 10);
    try {
      const response = await this.client.post(
        "/auth",
        { username, access_key: apiKey },
        { timeout: authTimeout },
      );
      if (response.data?.access_token) {
        this.client.defaults.headers["Authorization"] =
          `Bearer ${response.data.access_token}`;
      }
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.message || error?.message;
      throw new Error(`Auth failed (${status ?? "no-status"}): ${msg}`);
    }
  }

  // Crear cliente
  async createClient(
    clientData: CreateClientData,
    dynamicCredentials?: SigoCredentials,
  ): Promise<any> {
    await this.ensureAuth(dynamicCredentials);
    const payload = this.buildSiigoCustomerPayload(clientData);
    const response = await this.client.post("/v1/customers", payload);
    return response.data;
  }

  // Crear factura (payload mínimo a formato Siigo)
  async createInvoice(
    data: CreateInvoiceData,
    dynamicCredentials?: SigoCredentials,
  ): Promise<any> {
    await this.ensureAuth(dynamicCredentials);

    const TAX_ID = process.env.SIIGO_TAX_ID
      ? parseInt(process.env.SIIGO_TAX_ID, 10)
      : undefined;
    const PAYMENT_METHOD = process.env.SIIGO_PAYMENT_METHOD_ID
      ? parseInt(process.env.SIIGO_PAYMENT_METHOD_ID, 10)
      : undefined;

    const sigoPayload: any = {
      document: {
        id: process.env.SIIGO_DOCUMENT_ID
          ? parseInt(process.env.SIIGO_DOCUMENT_ID, 10)
          : 1,
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
        taxes: TAX_ID ? [{ id: TAX_ID }] : undefined,
        discount: 0,
      })),
      payments:
        PAYMENT_METHOD && data.totales?.total
          ? [
              {
                payment_method: PAYMENT_METHOD,
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

  // Obtener factura por número (para notas de crédito)
  async getInvoice(_serie: string, numero: string | number): Promise<any> {
    await this.ensureAuth();
    const res = await this.client.get(
      `/v1/invoices?number=${encodeURIComponent(String(numero))}`,
    );
    const items = res.data?.results || res.data || [];
    return Array.isArray(items) ? items[0] : items;
  }

  // Crear Nota de Crédito para anular una factura por serie/número
  async createCreditNoteByInvoiceNumber(
    serie: string,
    numero: string | number,
    motivo?: string,
    dynamicCredentials?: SigoCredentials,
  ): Promise<any> {
    await this.ensureAuth(dynamicCredentials);

    const inv = await this.getInvoice(serie, numero);
    if (!inv || !inv.id) throw new Error("Factura no encontrada en Siigo");

    const TAX_ID = process.env.SIIGO_TAX_ID
      ? parseInt(process.env.SIIGO_TAX_ID, 10)
      : undefined;
    const CREDIT_NOTE_DOC_ID = process.env.SIIGO_CREDIT_NOTE_DOCUMENT_ID
      ? parseInt(process.env.SIIGO_CREDIT_NOTE_DOCUMENT_ID, 10)
      : 2;

    const itemsSrc: any[] = inv.items || inv.document_items || [];
    const cnItems =
      Array.isArray(itemsSrc) && itemsSrc.length > 0
        ? itemsSrc.map((it: any) => ({
            code: it.code || it.codigo || it.product_code,
            description: it.description || it.descripcion || it.name,
            quantity: it.quantity || it.cantidad || 1,
            price: it.price || it.precio_unitario || it.unit_price || 0,
            discount: 0,
            taxes: TAX_ID ? [{ id: TAX_ID }] : undefined,
          }))
        : undefined;

    const payload: any = {
      document: { id: CREDIT_NOTE_DOC_ID },
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
}

// Singleton
let _sigoInstance: SigoService | null = null;
export const sigoService = {
  getInstance(): SigoService {
    if (!_sigoInstance) {
      _sigoInstance = new SigoService();
    }
    return _sigoInstance;
  },
};

export default sigoService;
