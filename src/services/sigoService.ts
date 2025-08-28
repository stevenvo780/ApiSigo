import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
import {
  SigoConfig,
  SigoInvoiceData,
  SigoApiResponse,
  SigoClient,
  InvoiceStatus,
  HealthCheckResult,
} from "@/types";
import {
  validateSigoConfig,
  validateSigoApiKey,
  validateSigoUsername,
} from "@/utils/validators";
import { getTimeoutConfig, createTimeoutConfig } from "@/config/timeouts";
import {
  createErrorContext,
  createErrorFromAxios,
  AuthenticationError,
  ValidationError,
  logError,
} from "@/utils/errors";
import { CircuitBreakerFactory } from "@/utils/circuit-breaker";
import { ApiMetrics, measureExecutionTime } from "@/utils/metrics";
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
 * Servicio para interactuar con la API de SIGO
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
   * Crear cliente en SIGO
   */
  async createClient(
    clientData: CreateClientData,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      // Use credentials if provided, otherwise use default from config
      const apiCredentials = dynamicCredentials || this.getDefaultCredentials();

      const response = await this.request({
        method: "POST",
        endpoint: "/clientes",
        data: clientData,
        credentials: apiCredentials,
      });

      return response;
    } catch (error) {
      this.logger.error("Error creando cliente en SIGO:", error);
      throw error;
    }
  }

  /**
   * Obtener cliente por RUC/NIT
   */
  async getClient(
    numeroDocumento: string,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      const apiCredentials = dynamicCredentials || this.getDefaultCredentials();

      const response = await this.request({
        method: "GET",
        endpoint: `/clientes/${numeroDocumento}`,
        credentials: apiCredentials,
      });

      return response;
    } catch (error) {
      this.logger.error(`Error obteniendo cliente ${numeroDocumento}:`, error);
      throw error;
    }
  }

  /**
   * Actualizar cliente
   */
  async updateClient(
    numeroDocumento: string,
    updateData: Partial<CreateClientData>,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      const apiCredentials = dynamicCredentials || this.getDefaultCredentials();

      const response = await this.request({
        method: "PUT",
        endpoint: `/clientes/${numeroDocumento}`,
        data: updateData,
        credentials: apiCredentials,
      });

      return response;
    } catch (error) {
      this.logger.error(`Error actualizando cliente ${numeroDocumento}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar cliente
   */
  async deleteClient(
    numeroDocumento: string,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      const apiCredentials = dynamicCredentials || this.getDefaultCredentials();

      const response = await this.request({
        method: "DELETE",
        endpoint: `/clientes/${numeroDocumento}`,
        credentials: apiCredentials,
      });

      return response;
    } catch (error) {
      this.logger.error(`Error eliminando cliente ${numeroDocumento}:`, error);
      throw error;
    }
  }

  /**
   * Crear factura en SIGO
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
      };

      console.log(`✅ [MOCK MODE] Factura mock creada: ${mockInvoice.data.id}`);
      return mockInvoice;
    }

    return this.circuitBreaker.execute(async () => {
      try {
        const isSigoFormat = "tipo_documento" in invoiceData;

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

        const sigoPayload = {
          document: {
            id: payload.tipo_documento || 1,
          },
          date: payload.fecha_emision,
          customer: {
            identification: payload.cliente.nit,
            branch_office: 0,
          },
          cost_center: 235,
          seller: 629,
          observations: payload.observaciones,
          items: payload.items.map((item: any, index: number) => ({
            code: item.codigo,
            description: item.descripcion,
            quantity: item.cantidad,
            price: item.precio_unitario,
            discount: 0,
            taxes: [
              {
                id: 13156,
                value: item.iva_valor,
              },
            ],
          })),
          payments: [
            {
              id: 5636,
              value: payload.totales.total,
              due_date: payload.fecha_vencimiento || payload.fecha_emision,
            },
          ],
          additional_fields: {},
        };

        console.log(
          `✅ Creando factura en Siigo: ${payload.serie}-${payload.numero || "auto"}`,
        );
        const response = await this.client.post("/v1/invoices", sigoPayload);

        console.log(`✅ Factura creada en Siigo: ${response.data.id}`);
        return response.data;
      } catch (error: any) {
        console.error(
          `❌ Error creando factura en SIGO:`,
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
   * Obtener factura por serie y número
   */
  async getInvoice(serie: string, numero: string | number): Promise<any> {
    try {
      const response = await this.client.get(`/facturas/${serie}/${numero}`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error obteniendo factura: ${message}`);
    }
  }

  /**
   * Actualizar estado de factura
   */
  async updateInvoiceStatus(
    serie: string,
    numero: string | number,
    status: InvoiceStatus,
  ): Promise<any> {
    try {
      const response = await this.client.patch(
        `/facturas/${serie}/${numero}/estado`,
        {
          estado: status,
        },
      );

      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error actualizando estado de factura: ${message}`);
    }
  }

  /**
   * Enviar factura a SUNAT/DIAN
   */
  async sendInvoiceToSunat(
    serie: string,
    numero: string | number,
  ): Promise<any> {
    try {
      const response = await this.client.post(
        `/facturas/${serie}/${numero}/enviar-sunat`,
      );
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error enviando factura a SUNAT: ${message}`);
    }
  }

  /**
   * Anular factura
   */
  async cancelInvoice(
    serie: string,
    numero: string | number,
    motivo: string,
  ): Promise<any> {
    try {
      const response = await this.client.post(
        `/facturas/${serie}/${numero}/anular`,
        {
          motivo: motivo,
        },
      );

      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error anulando factura: ${message}`);
    }
  }

  /**
   * Obtener estado de factura
   */
  async getInvoiceStatus(serie: string, numero: string | number): Promise<any> {
    try {
      const response = await this.client.get(
        `/facturas/${serie}/${numero}/estado`,
      );
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error obteniendo estado de factura: ${message}`);
    }
  }

  /**
   * Buscar clientes con filtros
   */
  async searchClients(
    params: {
      query: string;
      page?: number;
      limit?: number;
      tipoDocumento?: string;
    },
    credentials?: any
  ): Promise<any> {
    try {
      const apiCredentials = credentials || this.getDefaultCredentials();
      
      const queryParams = new URLSearchParams({
        q: params.query,
        page: (params.page || 1).toString(),
        limit: (params.limit || 20).toString(),
        ...(params.tipoDocumento && { tipoDocumento: params.tipoDocumento })
      });

      const response = await this.request({
        method: "GET",
        endpoint: `/clientes/search?${queryParams.toString()}`,
        credentials: apiCredentials
      });

      return response;
    } catch (error) {
      this.logger.error("Error buscando clientes:", error);
      throw error;
    }
  }

  /**
   * Obtener lista paginada de clientes
   */
  async getClientList(
    params: {
      page?: number;
      limit?: number;
      tipoDocumento?: string;
      activo?: boolean;
    },
    credentials?: any
  ): Promise<any> {
    try {
      const apiCredentials = credentials || this.getDefaultCredentials();
      
      const queryParams = new URLSearchParams({
        page: (params.page || 1).toString(),
        limit: (params.limit || 20).toString(),
        ...(params.tipoDocumento && { tipoDocumento: params.tipoDocumento }),
        ...(params.activo !== undefined && { activo: params.activo.toString() })
      });

      const response = await this.request({
        method: "GET",
        endpoint: `/clientes?${queryParams.toString()}`,
        credentials: apiCredentials
      });

      return response;
    } catch (error) {
      this.logger.error("Error obteniendo lista de clientes:", error);
      throw error;
    }
  }

  /**
   * Health check del servicio SIGO
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      await this.client.get("/health", { timeout: 5000 }).catch(() => {
        return this.client.get("/status", { timeout: 5000 }).catch(() => {
          return this.client.get("/", { timeout: 5000 });
        });
      });

      const responseTime = Date.now() - startTime;

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          sigo: "up",
          database: "up",
          webhook: "up",
        },
        response_time_ms: responseTime,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        services: {
          sigo: "down",
          database: "up",
          webhook: "up",
        },
        response_time_ms: Date.now() - startTime,
        errors: [
          error instanceof Error
            ? error.message
            : "Unknown error connecting to SIGO",
        ],
      };
    }
  }

  /**
   * Obtener configuración actual
   */
  getConfig(): SigoConfig {
    return {
      baseUrl: this.baseURL,
      baseURL: this.baseURL,
      apiKey: this.apiKey || "",
      username: this.username,
      password: this.password ? "***" : undefined,
      timeout: 30000,
      retries: 3,
      ivaRate: this.ivaRate,
      defaultCurrency: this.defaultCurrency,
      defaultSerie: this.defaultSerie,
    };
  }

  /**
   * Obtener credenciales por defecto
   */
  private getDefaultCredentials(): any {
    return {
      apiKey: process.env.SIGO_API_KEY,
      apiSecret: process.env.SIGO_API_SECRET,
      // Add other default credentials as needed
    };
  }
}

export function getSigoService(): SigoService {
  return new SigoService();
}

let sigoServiceInstance: SigoService | null = null;
export const sigoService = {
  getInstance(): SigoService {
    if (!sigoServiceInstance) {
      sigoServiceInstance = new SigoService();
    }
    return sigoServiceInstance;
  },
  async createInvoice(
    data: any,
    creds?: { apiKey?: string; username?: string },
  ) {
    return this.getInstance().createInvoice(data, creds as any);
  },
  async createClient(
    data: any,
    creds?: { apiKey?: string; username?: string },
  ) {
    return this.getInstance().createClient(data, creds as any);
  },
  async healthCheck() {
    return this.getInstance().healthCheck();
  },
};

export default sigoService;
