import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
import {
  // SigoConfig, // unused
  SigoInvoiceData,
  SigoApiResponse,
  InvoiceStatus,
  HealthCheckResult,
} from "@/types";
import { validateSigoApiKey, validateSigoUsername } from "@/utils/validators";
import { getTimeoutConfig } from "@/config/timeouts"; // removed createTimeoutConfig
import { createErrorContext, createErrorFromAxios } from "@/utils/errors";
import { CircuitBreakerFactory } from "@/utils/circuit-breaker";
import { ApiMetrics } from "@/utils/metrics"; // removed measureExecutionTime
import { LoggerFactory } from "@/utils/logger";

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

export interface UpdateClientData {
  razonSocial?: string;
  direccion?: string;
  email?: string;
  telefono?: string;
  estado?: string;
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
  valorUnitario?: number;
  iva_porcentaje?: number;
  iva_valor?: number;
  total?: number;
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
  metadata?: {
    source?: string;
    orderId?: string | number;
    timestamp?: string;
    [key: string]: any;
  };
}

/**
 * Servicio para interactuar con la API de SIGO (Siigo)
 */
export class SigoService {
  private client: any;
  private baseURL: string;
  private apiKey?: string;
  private username?: string;
  private password?: string;
  private ivaRate: number;
  private defaultCurrency: string;
  private defaultSerie: string;
  private mockMode: boolean;
  private circuitBreaker = CircuitBreakerFactory.createSigoBreaker();
  private logger = LoggerFactory.getSigoLogger();

  constructor() {
    console.log("🔍 [SigoService] Debug environment variables:");
    console.log("  Working directory:", process.cwd());
    console.log("  MOCK_MODE:", process.env.MOCK_MODE || "false");
    console.log("  SIGO_API_URL:", process.env.SIGO_API_URL);
    console.log(
      "  SIGO_API_KEY:",
      process.env.SIGO_API_KEY ? "***PRESENT***" : "MISSING",
    );
    console.log("  SIGO_USERNAME:", process.env.SIGO_USERNAME);
    console.log(
      "  SIGO_PASSWORD:",
      process.env.SIGO_PASSWORD ? "***PRESENT***" : "MISSING",
    );

    this.baseURL = process.env.SIGO_API_URL || "https://api.siigo.com";
    this.apiKey = process.env.SIGO_API_KEY;
    this.username = process.env.SIGO_USERNAME;
    this.password = process.env.SIGO_PASSWORD;
    this.mockMode =
      process.env.MOCK_MODE === "true" || process.env.NODE_ENV === "test";

    this.ivaRate = parseFloat(process.env.IVA_COLOMBIA || "19");
    this.defaultCurrency = process.env.MONEDA_DEFAULT || "COP";
    this.defaultSerie = process.env.SIGO_SERIE_DEFAULT || "FV";

    const defaultTimeouts = getTimeoutConfig("sigo", "default");
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: defaultTimeouts.total,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Partner-Id": "Siigo-API-Integration",
        Connection: "close",
      },
    });

    this.setupInterceptors();
  }

  /**
   * Helpers de mapeo para clientes Siigo
   */
  private mapTipoDocumentoToIdType(tipo: string): number {
    // Siigo (Colombia): 31=NIT, 13=CC, 22=CE, 41=NIT de otro país; ajusta según país si aplica
    const map: Record<string, number> = {
      NIT: 31,
      CC: 13,
      CE: 22,
      DNI: 13, // aproximación si se usa en CO
      RUC: 41, // NIT extranjero como placeholder
    };
    return map[tipo] || 31;
  }

  private mapPersonType(tipo: string): "Company" | "Person" {
    return tipo === "NIT" || tipo === "RUC" ? "Company" : "Person";
  }

  private buildSiigoCustomerPayload(data: CreateClientData) {
    const idType = this.mapTipoDocumentoToIdType(data.tipoDocumento);
    const personType = this.mapPersonType(data.tipoDocumento);

    const phones = data.telefono
      ? [{ indicative: "57", number: data.telefono }]
      : undefined;

    const address = data.direccion
      ? {
          address: data.direccion,
          city: {
            country_code: process.env.SIIGO_COUNTRY_CODE || "CO",
            state_code: data.departamento || undefined,
            city_code: data.ciudad || undefined,
          },
        }
      : undefined;

    return {
      person_type: personType,
      id_type: idType,
      identification: data.numeroDocumento,
      name: data.razonSocial,
      commercial_name: data.razonSocial,
      address,
      phones,
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

  /**
   * Configurar interceptores de respuesta
   */
  private setupInterceptors(): void {
    this.client.interceptors.response.use(
      (response: any) => response,
      (error: any) => {
        console.error("SIGO API Error - DETAILED:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
          requestBody: error.config?.data,
          errorCode: error.code,
          errorStack: error.stack,
        });
        throw error;
      },
    );
  }

  /**
   * Autenticar con SIGO API usando el formato correcto
   */
  async authenticate(dynamicCredentials?: {
    apiKey?: string;
    username?: string;
  }): Promise<any> {
    // Temporarily bypass circuit breaker for debugging
    const executeAuth = async () => {
      const startTime = Date.now();
      try {
        ApiMetrics.recordRequest("sigo", "authenticate");

        const username = dynamicCredentials?.username || this.username;
        const apiKey = dynamicCredentials?.apiKey || this.apiKey;

        const usernameValidation = validateSigoUsername(username);
        if (!usernameValidation.isValid) {
          throw new Error(
            `Username inválido: ${usernameValidation.error} - ${usernameValidation.details}`,
          );
        }

        const apiKeyValidation = validateSigoApiKey(apiKey);
        if (!apiKeyValidation.isValid) {
          throw new Error(
            `API key inválida: ${apiKeyValidation.error} - ${apiKeyValidation.details}`,
          );
        }

        this.logger.info("Starting authentication with valid credentials", {
          metadata: {
            hasUsername: !!username,
            hasApiKey: !!apiKey,
            usernamePrefix: username?.substring(0, 10) + "..." || "N/A",
            apiKeyPrefix: apiKey?.substring(0, 10) + "..." || "N/A",
          },
        });

        const authTimeouts = getTimeoutConfig("sigo", "authentication");

        console.log("🔍 [AUTH DEBUG] Making authentication request:", {
          url: this.baseURL + "/auth",
          method: "POST",
          body: {
            username: username,
            access_key: apiKey?.substring(0, 10) + "...",
          },
          timeout: authTimeouts.total,
          headers: this.client.defaults.headers,
        });

        const response = await this.client.post(
          "/auth",
          {
            username: username,
            access_key: apiKey,
          },
          {
            timeout: authTimeouts.total,
          },
        );

        if (response.data.access_token) {
          this.client.defaults.headers["Authorization"] =
            `Bearer ${response.data.access_token}`;

          const duration = Date.now() - startTime;
          this.logger.auth(true, "sigo", duration, {
            metadata: { tokenReceived: true },
          });

          ApiMetrics.recordAuthentication("sigo", true, duration);
          ApiMetrics.recordResponse(
            "sigo",
            "authenticate",
            response.status || 200,
            duration,
          );
        }

        return response.data;
      } catch (error) {
        console.log("🔍 [AUTH ERROR] Authentication request failed:", {
          errorMessage: error.message,
          errorCode: error.code,
          errorName: error.name,
          responseStatus: error.response?.status,
          responseData: error.response?.data,
          responseHeaders: error.response?.headers,
          requestConfig: {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout,
          },
        });

        const duration = Date.now() - startTime;

        this.logger.auth(false, "sigo", duration, {
          error: error as Error,
          metadata: {
            usernameProvided: !!this.username,
            apiKeyProvided: !!this.apiKey,
            errorType: error.name || "AuthError",
          },
        });

        ApiMetrics.recordAuthentication("sigo", false, duration);
        ApiMetrics.recordError(
          "sigo",
          "authenticate",
          error.name || "AuthError",
          error.message,
        );

        const context = createErrorContext("SigoService", "authenticate", {
          metadata: {
            usernameProvided: !!this.username,
            apiKeyProvided: !!this.apiKey,
          },
        });

        const authError = createErrorFromAxios(
          error,
          context,
          "Error de autenticación con Siigo API",
        );

        throw authError;
      }
    };

    return executeAuth();
  }

  /**
   * Crear cliente en Siigo (/v1/customers)
   */
  async createClient(
    clientData: CreateClientData,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(dynamicCredentials);
      }

      const payload = this.buildSiigoCustomerPayload(clientData);
      const response = await this.client.post("/v1/customers", payload);
      return response.data;
    } catch (error) {
      this.logger.error("Error creando cliente en Siigo:", error);
      throw error;
    }
  }

  /**
   * Obtener cliente por identificación
   */
  async getClient(
    numeroDocumento: string,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(dynamicCredentials);
      }

      const response = await this.client.get(
        `/v1/customers?identification=${encodeURIComponent(numeroDocumento)}`,
      );
      const items = response.data?.results || response.data || [];
      return Array.isArray(items) ? items[0] : items;
    } catch (error) {
      this.logger.error(`Error obteniendo cliente ${numeroDocumento}:`, error);
      throw error;
    }
  }

  /**
   * Actualizar cliente (resuelve id por identificación y hace PUT /v1/customers/{id})
   */
  async updateClient(
    numeroDocumento: string,
    updateData: Partial<CreateClientData>,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(dynamicCredentials);
      }

      const existing = await this.getClient(
        numeroDocumento,
        dynamicCredentials,
      );
      const id = existing?.id;
      if (!id) {
        throw new Error("Cliente no encontrado en Siigo");
      }

      const merged: CreateClientData = {
        tipoDocumento: existing.id_type || updateData.tipoDocumento || "NIT",
        numeroDocumento,
        razonSocial: updateData.razonSocial || existing.name,
        email: updateData.email || existing?.contacts?.[0]?.email,
        telefono: updateData.telefono || existing?.phones?.[0]?.number,
        direccion: updateData.direccion || existing?.address?.address,
        activo:
          updateData.activo !== undefined ? updateData.activo : existing.active,
      } as any;

      const payload = this.buildSiigoCustomerPayload(merged);
      const response = await this.client.put(`/v1/customers/${id}`, payload);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error actualizando cliente ${numeroDocumento}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Eliminar cliente (resuelve id por identificación y hace DELETE /v1/customers/{id})
   */
  async deleteClient(
    numeroDocumento: string,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(dynamicCredentials);
      }

      const existing = await this.getClient(
        numeroDocumento,
        dynamicCredentials,
      );
      const id = existing?.id;
      if (!id) {
        throw new Error("Cliente no encontrado en Siigo");
      }

      const response = await this.client.delete(`/v1/customers/${id}`);
      return response.data || { deleted: true };
    } catch (error) {
      this.logger.error(`Error eliminando cliente ${numeroDocumento}:`, error);
      throw error;
    }
  }

  /**
   * Crear factura en Siigo
   */
  async createInvoice(
    invoiceData: CreateInvoiceData | SigoInvoiceData,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<SigoApiResponse> {
    // Return mock response if in mock mode
    if (this.mockMode) {
      console.log(
        "✅ [MOCK MODE] Creando factura mock - no se conectará a Siigo real",
      );
      const mockInvoice = {
        success: true,
        data: {
          id: `INV-${Date.now()}`,
          serie: (invoiceData as CreateInvoiceData).serie || "F001",
          numero:
            (invoiceData as CreateInvoiceData).numero ||
            Math.floor(Math.random() * 10000) + 1,
          fecha_emision: new Date().toISOString().split("T")[0],
          total: (invoiceData as CreateInvoiceData).totales?.total || 0,
          cliente:
            (invoiceData as CreateInvoiceData).cliente?.razonSocial ||
            "Cliente Mock",
          status: "MOCK_CREATED",
          timestamp: new Date().toISOString(),
        },
        message: "Factura mock creada exitosamente",
        status_code: 201,
      } as any;

      console.log(`✅ [MOCK MODE] Factura mock creada: ${mockInvoice.data.id}`);
      return mockInvoice;
    }

    return this.circuitBreaker.execute(async () => {
      try {
        // Construcción de payload estándar (con impuestos y pagos según Siigo)
        const isSigoFormat = "tipo_documento" in (invoiceData as any);
        let payload: any;

        if (isSigoFormat) {
          const sigoData = invoiceData as SigoInvoiceData;
          payload = {
            tipo_documento:
              sigoData.tipo_documento ||
              process.env.TIPO_DOCUMENTO_FACTURA ||
              "01",
            serie: sigoData.serie || this.defaultSerie,
            numero: sigoData.numero_correlativo,
            fecha_emision:
              sigoData.fecha_emision || new Date().toISOString().split("T")[0],
            moneda: sigoData.moneda || this.defaultCurrency,
            cliente: {
              nit: sigoData.cliente.numero_documento,
              razon_social: sigoData.cliente.razon_social,
              direccion: sigoData.cliente.direccion,
              tipo_documento:
                sigoData.cliente.tipo_documento ||
                process.env.TIPO_DOCUMENTO_CLIENTE ||
                "31",
            },
            items: sigoData.items.map((item) => ({
              codigo: item.codigo_producto,
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              precio_unitario: item.precio_unitario,
              valor_unitario: item.valor_unitario,
              iva_porcentaje: this.ivaRate,
              iva_valor: item.iva_total,
              total: item.precio_total,
            })),
            totales: {
              subtotal: sigoData.resumen.subtotal,
              iva: sigoData.resumen.iva,
              total: sigoData.resumen.total,
            },
            observaciones: "Factura generada automáticamente desde Hub Central",
            metadata: {
              source: "hub-central",
              orderId: sigoData.referencia_externa.orden_graf,
              timestamp: new Date().toISOString(),
            },
          };
        } else {
          const stdData = invoiceData as CreateInvoiceData;

          const subtotal =
            stdData.totales?.subtotal || this.calculateSubtotal(stdData.items);
          const iva =
            stdData.totales?.iva ||
            stdData.totales?.igv ||
            (subtotal * this.ivaRate) / 100;
          const total = stdData.totales?.total || subtotal + iva;

          payload = {
            tipo_documento:
              stdData.tipoDocumento ||
              process.env.TIPO_DOCUMENTO_FACTURA ||
              "01",
            serie: stdData.serie || this.defaultSerie,
            numero: stdData.numero,
            fecha_emision:
              stdData.fechaEmision || new Date().toISOString().split("T")[0],
            fecha_vencimiento: stdData.fechaVencimiento,
            moneda: stdData.moneda || this.defaultCurrency,
            cliente: {
              nit: stdData.cliente.ruc || stdData.cliente.nit,
              razon_social: stdData.cliente.razonSocial,
              direccion: stdData.cliente.direccion,
              email: stdData.cliente.email,
              telefono: stdData.cliente.telefono,
              tipo_documento:
                stdData.cliente.tipo_documento ||
                process.env.TIPO_DOCUMENTO_CLIENTE ||
                "31",
            },
            items: stdData.items.map((item) => ({
              codigo: item.codigo || item.sku || "PROD001",
              descripcion: item.descripcion || item.title,
              cantidad: item.cantidad || item.quantity,
              precio_unitario: item.precioUnitario || item.price,
              valor_unitario: item.valorUnitario || item.price,
              iva_porcentaje: this.ivaRate,
              iva_valor:
                ((item.precioUnitario || item.price || 0) *
                  (item.cantidad || item.quantity || 0) *
                  this.ivaRate) /
                100,
              total:
                (item.precioUnitario || item.price || 0) *
                (item.cantidad || item.quantity || 0) *
                (1 + this.ivaRate / 100),
            })),
            totales: {
              subtotal: subtotal,
              iva: iva,
              total: total,
            },
            observaciones:
              stdData.observaciones ||
              "Factura generada automáticamente desde Hub Central",
            metadata: {
              source: "hub-central",
              orderId: stdData.orderId,
              timestamp: new Date().toISOString(),
              ...stdData.metadata,
            },
          };
        }

        if (
          !this.client.defaults.headers["Authorization"] ||
          !this.client.defaults.headers["Authorization"].includes("Bearer")
        ) {
          await this.authenticate(dynamicCredentials);
        }

        const TAX_ID = parseInt(process.env.SIIGO_TAX_ID || "13156", 10);
        const PAYMENT_METHOD = parseInt(
          process.env.SIIGO_PAYMENT_METHOD_ID || "5636",
          10,
        );
        const COST_CENTER = process.env.SIIGO_COST_CENTER_ID
          ? parseInt(process.env.SIIGO_COST_CENTER_ID, 10)
          : undefined;
        const SELLER = process.env.SIIGO_SELLER_ID
          ? parseInt(process.env.SIIGO_SELLER_ID, 10)
          : undefined;

        const sigoPayload = {
          document: {
            id: 1, // id del tipo de documento configurado en Siigo
          },
          date: payload.fecha_emision,
          customer: {
            identification: payload.cliente.nit,
            branch_office: 0,
          },
          ...(COST_CENTER ? { cost_center: COST_CENTER } : {}),
          ...(SELLER ? { seller: SELLER } : {}),
          observations: payload.observaciones,
          items: payload.items.map((item: any) => ({
            code: item.codigo,
            description: item.descripcion,
            quantity: item.cantidad,
            price: item.precio_unitario,
            discount: 0,
            taxes: [
              {
                id: TAX_ID,
              },
            ],
          })),
          payments: [
            {
              payment_method: PAYMENT_METHOD,
              value: payload.totales.total,
              due_date: payload.fecha_vencimiento || payload.fecha_emision,
            },
          ],
          additional_fields: {},
        };

        this.logger.info(
          `✅ Creando factura en Siigo: ${payload.serie}-${payload.numero || "auto"}`,
        );
        const response = await this.client.post("/v1/invoices", sigoPayload);
        this.logger.info(`✅ Factura creada en Siigo: ${response.data.id}`);
        return response.data;
      } catch (error: any) {
        console.error(
          `❌ Error creando factura en Siigo:`,
          error.response?.data || error.message,
        );
        throw new Error(
          `Error creando factura: ${error.response?.data?.message || error.message}`,
        );
      }
    });
  }

  /**
   * Método auxiliar para calcular subtotal
   */
  private calculateSubtotal(items: InvoiceItem[]): number {
    return items.reduce((sum, item) => {
      const price = item.precioUnitario || item.price || 0;
      const quantity = item.cantidad || item.quantity || 0;
      return sum + price * quantity;
    }, 0);
  }

  /**
   * Obtener factura por serie/número (mejor esfuerzo usando filtros)
   */
  async getInvoice(serie: string, numero: string | number): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate();
      }
      // Siigo no expone /facturas; usar listado filtrado si está disponible
      const res = await this.client.get(
        `/v1/invoices?number=${encodeURIComponent(String(numero))}`,
      );
      const items = res.data?.results || res.data || [];
      return Array.isArray(items) ? items[0] : items;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error obteniendo factura: ${message}`);
    }
  }

  /**
   * Actualizar estado de factura (no hay endpoint público directo; placeholder)
   */
  async updateInvoiceStatus(
    _serie: string,
    _numero: string | number,
    _status: InvoiceStatus,
  ): Promise<any> {
    try {
      throw new Error(
        "updateInvoiceStatus no está soportado por el API público de Siigo",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error actualizando estado de factura: ${message}`);
    }
  }

  /**
   * Enviar factura a SUNAT/DIAN (no expuesto como endpoint público en Siigo)
   */
  async sendInvoiceToSunat(
    _serie: string,
    _numero: string | number,
  ): Promise<any> {
    try {
      throw new Error(
        "sendInvoiceToSunat no está soportado por el API público de Siigo",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error enviando factura a SUNAT/DIAN: ${message}`);
    }
  }

  /**
   * Anular factura (usar notas crédito según procesos de Siigo)
   */
  async cancelInvoice(
    _serie: string,
    _numero: string | number,
    _motivo: string,
  ): Promise<any> {
    try {
      throw new Error(
        "cancelInvoice no está soportado directamente; use nota crédito en Siigo",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error anulando factura: ${message}`);
    }
  }

  /**
   * Obtener estado de factura (consultar invoice por id/number)
   */
  async getInvoiceStatus(serie: string, numero: string | number): Promise<any> {
    try {
      const inv = await this.getInvoice(serie, numero);
      return inv?.status || inv?.state || inv;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error obteniendo estado de factura: ${message}`);
    }
  }

  /**
   * Listar facturas (paginado)
   */
  async listInvoices(
    params: { page?: number; limit?: number; number?: string; state?: string },
    credentials?: any,
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(credentials);
      }

      const qp = new URLSearchParams({
        page: String(params.page || 1),
        page_size: String(params.limit || 20),
      });
      if (params.number) qp.append("number", params.number);
      if (params.state) qp.append("state", params.state);

      const res = await this.client.get(`/v1/invoices?${qp.toString()}`);
      return res.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error listando facturas: ${message}`);
    }
  }

  /**
   * Buscar clientes por nombre o identificación
   */
  async searchClients(
    params: {
      query: string;
      page?: number;
      limit?: number;
      tipoDocumento?: string;
    },
    credentials?: any,
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(credentials);
      }

      const qp = new URLSearchParams({
        page: String(params.page || 1),
        page_size: String(params.limit || 20),
      });

      // Si es numérico, buscar por identificación; si no, por nombre
      if (/^\d+$/.test(params.query)) {
        qp.append("identification", params.query);
      } else {
        qp.append("name", params.query);
      }

      const res = await this.client.get(`/v1/customers?${qp.toString()}`);
      return res.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error buscando clientes: ${message}`);
    }
  }

  /**
   * Listado de clientes (paginado)
   */
  async getClientList(
    params: {
      page?: number;
      limit?: number;
      tipoDocumento?: string;
      activo?: boolean;
    },
    credentials?: any,
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(credentials);
      }

      const qp = new URLSearchParams({
        page: String(params.page || 1),
        page_size: String(params.limit || 20),
      });
      if (params.tipoDocumento)
        qp.append(
          "id_type",
          String(this.mapTipoDocumentoToIdType(params.tipoDocumento)),
        );
      if (typeof params.activo === "boolean")
        qp.append("active", params.activo ? "true" : "false");

      const res = await this.client.get(`/v1/customers?${qp.toString()}`);
      return res.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error listando clientes: ${message}`);
    }
  }

  /**
   * Health check contra Siigo
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate();
      }

      await this.client.get("/v1/customers?page=1&page_size=1");

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: { sigo: "up" },
        response_time_ms: Date.now() - start,
      } as HealthCheckResult;
    } catch (error) {
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        services: { sigo: "down" },
        response_time_ms: Date.now() - start,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      } as HealthCheckResult;
    }
  }

  /**
   * Crear Nota de Crédito para anular una factura por serie/número (anulación total)
   */
  async createCreditNoteByInvoiceNumber(
    serie: string,
    numero: string | number,
    motivo?: string,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(dynamicCredentials);
      }

      const inv = await this.getInvoice(serie, numero);
      if (!inv || !inv.id) {
        throw new Error(
          "Factura no encontrada en Siigo para emitir nota de crédito",
        );
      }

      const CREDIT_NOTE_DOC_ID = parseInt(
        process.env.SIIGO_CREDIT_NOTE_DOCUMENT_ID || "2",
        10,
      );
      const TAX_ID = parseInt(process.env.SIIGO_TAX_ID || "13156", 10);

      // Mejor esfuerzo para mapear items del invoice a la nota de crédito
      const itemsSrc: any[] = inv.items || inv?.document_items || [];
      const cnItems =
        Array.isArray(itemsSrc) && itemsSrc.length > 0
          ? itemsSrc.map((it: any) => ({
              code: it.code || it.codigo || it.product_code || "PROD001",
              description:
                it.description || it.descripcion || it.name || "Item",
              quantity: it.quantity || it.cantidad || 1,
              price: it.price || it.precio_unitario || it.unit_price || 0,
              discount: 0,
              taxes: [{ id: TAX_ID }],
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
        observations: motivo || "Anulación total por solicitud del cliente",
      };

      if (cnItems) payload.items = cnItems;

      this.logger.info(
        `✅ Creando nota de crédito en Siigo para factura ${serie}-${numero}`,
      );
      const response = await this.client.post("/v1/credit-notes", payload);
      this.logger.info(
        `✅ Nota de crédito creada: ${response.data?.id || "(sin id)"}`,
      );
      return response.data;
    } catch (error: any) {
      console.error(
        `❌ Error creando nota de crédito en Siigo:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Error creando nota de crédito: ${error.response?.data?.message || error.message}`,
      );
    }
  }
}

// Singleton para compatibilidad con los controllers existentes
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
