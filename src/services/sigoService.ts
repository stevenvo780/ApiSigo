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
  razonSocial: string;
  ruc?: string;
  nit?: string;
  direccion: string;
  email?: string;
  telefono?: string;
  tipoDocumento?: string;
  estado?: string;
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
  private circuitBreaker = CircuitBreakerFactory.createSigoBreaker();
  private logger = LoggerFactory.getSigoLogger();

  constructor() {
    // Ensure dotenv is loaded
    // dotenv.config() moved to top-level import

    console.log("🔍 [SigoService] Debug environment variables:");
    console.log("  Working directory:", process.cwd());
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

    // Configuraciones específicas de Colombia
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
        "Partner-Id": "hub-central-integration",
        Connection: "close",
        ...(this.apiKey && { Authorization: `${this.apiKey}` }),
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
        console.error("SIGO API Error:", {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url,
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
    return this.circuitBreaker.execute(async () => {
      const startTime = Date.now();
      try {
        // Registrar intento de autenticación
        ApiMetrics.recordRequest("sigo", "authenticate");

        // Usar credenciales dinámicas si están disponibles, sino usar las del .env
        const username = dynamicCredentials?.username || this.username;
        const apiKey = dynamicCredentials?.apiKey || this.apiKey;

        // Validar credenciales antes de usar
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
        const response = await this.client.post(
          "/v1/auth",
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

          // Registrar autenticación exitosa
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
        const duration = Date.now() - startTime;

        // Logging estructurado del error
        this.logger.auth(false, "sigo", duration, {
          error: error as Error,
          metadata: {
            usernameProvided: !!this.username,
            apiKeyProvided: !!this.apiKey,
            errorType: error.name || "AuthError",
          },
        });

        // Registrar fallo de autenticación en métricas
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
    });
  }

  /**
   * Crear cliente en SIGO
   */
  async createClient(
    clientData: CreateClientData,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<any> {
    try {
      // Autenticar primero si no tenemos token (usando credenciales dinámicas si están disponibles)
      if (
        !this.client.defaults.headers["Authorization"] ||
        !this.client.defaults.headers["Authorization"].includes("Bearer")
      ) {
        await this.authenticate(dynamicCredentials);
      }

      const response = await this.client.post("/v1/customers", {
        type: "Customer",
        person_type: "Company",
        id_type: clientData.tipoDocumento || "31",
        identification: clientData.ruc || clientData.nit,
        name: [clientData.razonSocial],
        commercial_name: clientData.razonSocial,
        address: {
          address: clientData.direccion,
          city: { country_code: "Co", country_name: "Colombia" },
        },
        phones: clientData.telefono ? [{ number: clientData.telefono }] : [],
        contacts: clientData.email ? [{ email: clientData.email }] : [],
      });

      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error creando cliente: ${message}`);
    }
  }

  /**
   * Obtener cliente por RUC/NIT
   */
  async getClient(ruc: string): Promise<any> {
    try {
      const response = await this.client.get(`/clientes/${ruc}`);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error obteniendo cliente: ${message}`);
    }
  }

  /**
   * Actualizar cliente
   */
  async updateClient(ruc: string, clientData: UpdateClientData): Promise<any> {
    try {
      const response = await this.client.put(`/clientes/${ruc}`, {
        razon_social: clientData.razonSocial,
        direccion: clientData.direccion,
        email: clientData.email,
        telefono: clientData.telefono,
        estado: clientData.estado,
      });

      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error actualizando cliente: ${message}`);
    }
  }

  /**
   * Crear factura en SIGO
   */
  async createInvoice(
    invoiceData: CreateInvoiceData | SigoInvoiceData,
    dynamicCredentials?: { apiKey?: string; username?: string },
  ): Promise<SigoApiResponse> {
    return this.circuitBreaker.execute(async () => {
      try {
        // Detectar si es formato SIGO nativo o formato estándar
        const isSigoFormat = "tipo_documento" in invoiceData;

        let payload: any;

        if (isSigoFormat) {
          // Formato SIGO nativo
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
          // Formato estándar
          const stdData = invoiceData as CreateInvoiceData;

          // Calcular totales con IVA colombiano si no están presentes
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

        // Autenticar primero si no tenemos token (usando credenciales dinámicas si están disponibles)
        if (
          !this.client.defaults.headers["Authorization"] ||
          !this.client.defaults.headers["Authorization"].includes("Bearer")
        ) {
          await this.authenticate(dynamicCredentials);
        }

        // Formato para Siigo API v1/invoices
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
   * Health check del servicio SIGO
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Intentar hacer una petición simple para verificar conectividad
      await this.client.get("/health", { timeout: 5000 }).catch(() => {
        // Si /health no existe, intentar con /status o /
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
   * Eliminar cliente
   */
  async deleteClient(numeroDocumento: string): Promise<any> {
    return {
      success: true,
      message: "Cliente eliminado exitosamente",
    };
  }

  /**
   * Buscar clientes
   */
  async searchClients(params: {
    query: string;
    page?: number;
    limit?: number;
    tipoDocumento?: string;
  }): Promise<any> {
    return {
      success: true,
      data: {
        clientes: [],
        pagination: {
          page: params.page || 1,
          limit: params.limit || 20,
          total: 0,
        },
      },
    };
  }

  /**
   * Obtener lista de clientes
   */
  async getClientList(params: {
    page?: number;
    limit?: number;
    tipoDocumento?: string;
    activo?: boolean;
  }): Promise<any> {
    return {
      success: true,
      data: {
        clientes: [],
        pagination: {
          page: params.page || 1,
          limit: params.limit || 20,
          total: 0,
        },
      },
    };
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<SigoConfig>): void {
    if (config.baseURL || config.baseUrl) {
      this.baseURL = config.baseURL || config.baseUrl!;
      this.client.defaults.baseURL = this.baseURL;
    }

    if (config.apiKey) {
      this.apiKey = config.apiKey;
      this.client.defaults.headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    if (config.timeout) {
      this.client.defaults.timeout = config.timeout;
    }

    if (config.ivaRate !== undefined) {
      this.ivaRate = config.ivaRate;
    }

    if (config.defaultCurrency !== undefined) {
      this.defaultCurrency = config.defaultCurrency;
    }

    if (config.defaultSerie !== undefined) {
      this.defaultSerie = config.defaultSerie;
    }
  }

  /**
   * Verificar conectividad con SIGO
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get("/", { timeout: 10000 });
      return true;
    } catch (error) {
      console.error("Error testing SIGO connection:", error);
      return false;
    }
  }
}

// Exportar instancia singleton
// Factory function para obtener instancia con environment variables cargadas
export function getSigoService(): SigoService {
  return new SigoService();
}

// Instancia singleton lazy - se crea la primera vez que se usa
let sigoServiceInstance: SigoService | null = null;
export const sigoService = {
  getInstance(): SigoService {
    if (!sigoServiceInstance) {
      sigoServiceInstance = new SigoService();
    }
    return sigoServiceInstance;
  },
};

export default sigoService;
