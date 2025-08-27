import axios from "axios";
import * as crypto from "crypto";
import {
  WebhookConfig,
  WebhookPayload,
  WebhookFacturaCreada,
  HealthCheckResult,
} from "@/types";

export interface FacturaData {
  factura_id: string;
  order_id: number;
  documento_sigo_id: string;
  estado: string;
  monto: number;
  pdf_url: string;
  created_at: string;
}

/**
 * Servicio para enviar webhooks de vuelta al Hub Central
 */
export class WebhookService {
  private hubCentralUrl: string;
  private webhookSecret: string;
  private maxRetries: number;
  private retryDelay: number;
  private client: any;

  constructor() {
    this.hubCentralUrl = process.env.HUB_CENTRAL_URL || "";
    this.webhookSecret = process.env.APISIGO_WEBHOOK_SECRET || "";
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo inicial

    this.client = axios.create({
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ApiSigo-Webhook/1.0",
      },
    });
  }

  /**
   * Generar firma HMAC-SHA256 para validación
   */
  generarFirmaHMAC(payload: object, secret: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  /**
   * Enviar confirmación de factura creada al Hub Central
   */
  async enviarFacturaCreada(facturaData: any): Promise<void> {
    const webhookUrl = process.env.HUB_CENTRAL_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("HUB_CENTRAL_WEBHOOK_URL no configurada");
      return;
    }

    const payload = {
      evento: "factura.creada",
      timestamp: new Date().toISOString(),
      datos: {
        factura_id: facturaData.factura_id,
        sigo_id: facturaData.sigo_id,
        serie: facturaData.serie,
        numero: facturaData.numero,
        estado: facturaData.estado,
      },
    };

    await this.enviarWebhookConReintentos(webhookUrl, payload);
  }

  /**
   * Enviar error al Hub Central
   */
  async enviarError(
    orderId: string,
    errorData: { error: string; details: string },
  ): Promise<void> {
    const webhookUrl = process.env.HUB_CENTRAL_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("HUB_CENTRAL_WEBHOOK_URL no configurada");
      return;
    }

    const payload = {
      evento: "factura.error",
      timestamp: new Date().toISOString(),
      datos: {
        order_id: orderId,
        error: errorData.error,
        details: errorData.details,
      },
    };

    await this.enviarWebhookConReintentos(webhookUrl, payload);
  }

  /**
   * Enviar webhook con sistema de reintentos
   */
  async enviarWebhookConReintentos(
    url: string,
    payload: any,
    opciones: {
      maxIntentos?: number;
      delayBase?: number;
      timeout?: number;
    } = {},
  ): Promise<any> {
    const maxIntentos = opciones.maxIntentos || this.maxRetries;
    const delayBase = opciones.delayBase || this.retryDelay;
    const timeout = opciones.timeout || 5000;

    let lastError: any;

    for (let attempt = 1; attempt <= maxIntentos; attempt++) {
      try {
        const signature = this.generarFirmaHMAC(payload, this.webhookSecret);

        const response = await this.client.post(url, payload, {
          timeout,
          headers: {
            "x-apisigo-signature": `sha256=${signature}`,
          },
        });

        console.log(`Webhook enviado exitosamente (intento ${attempt}):`, {
          url,
          status: response.status,
          event_type: payload.event_type || payload.evento,
        });

        return response.data;
      } catch (error: any) {
        lastError = error;

        console.error(
          `Error enviando webhook (intento ${attempt}/${maxIntentos}):`,
          {
            url,
            status: error.response?.status,
            message: error.message,
            event_type: payload.event_type || payload.evento,
          },
        );

        // Si es el último intento, no esperar
        if (attempt < maxIntentos) {
          const delay = delayBase * Math.pow(2, attempt - 1); // Backoff exponencial
          await this.wait(delay);
        }
      }
    }

    // Si llegamos aquí, todos los reintentos fallaron
    throw lastError || new Error("Todos los reintentos fallaron");
  }

  /**
   * Enviar webhook genérico
   */
  async enviarWebhook(eventType: string, data: any): Promise<any> {
    const payload: WebhookPayload = {
      event: eventType,
      event_type: eventType,
      source: "apisigo",
      timestamp: new Date().toISOString(),
      data,
    };

    const url = `${this.hubCentralUrl}/api/v1/webhooks/apisigo/${eventType.replace(".", "-")}`;

    return this.enviarWebhookConReintentos(url, payload);
  }

  /**
   * Generar firma HMAC-SHA256 para el webhook
   */
  generarFirma(payload: object): string {
    if (!this.webhookSecret) {
      throw new Error("APISIGO_WEBHOOK_SECRET no configurado");
    }

    return crypto
      .createHmac("sha256", this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  /**
   * Validar firma de webhook recibido
   */
  validarFirma(payload: object, receivedSignature: string): boolean {
    try {
      const expectedSignature = this.generarFirma(payload);
      return expectedSignature === receivedSignature.replace("sha256=", "");
    } catch (error) {
      console.error("Error validando firma webhook:", error);
      return false;
    }
  }

  /**
   * Función helper para esperar
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validar configuración del servicio
   */
  validateConfig(): boolean {
    if (!this.hubCentralUrl) {
      throw new Error("HUB_CENTRAL_URL no configurado");
    }

    if (!this.webhookSecret) {
      throw new Error("APISIGO_WEBHOOK_SECRET no configurado");
    }

    return true;
  }

  /**
   * Health check del servicio de webhooks
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      this.validateConfig();

      // Probar conectividad al Hub Central
      const healthUrl = `${this.hubCentralUrl}/api/v1/health`;
      const response = await this.client.get(healthUrl, { timeout: 5000 });

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          sigo: "up",
          database: "up",
          webhook: "up",
        },
        response_time_ms: Date.now() - Date.now(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        services: {
          sigo: "down",
          database: "up",
          webhook: "down",
        },
        response_time_ms: Date.now() - Date.now(),
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }

  /**
   * Obtener configuración actual
   */
  getConfig(): WebhookConfig {
    return {
      secret: this.webhookSecret || "",
      timeout: 30000,
      retries: this.maxRetries || 3,
      webhookSecret: this.webhookSecret ? "***configured***" : "",
      hubCentralUrl: this.hubCentralUrl,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      backoff: {
        initial: 1000,
        multiplier: 2,
        max: 30000,
      },
    };
  }

  /**
   * Actualizar configuración
   */
  updateConfig(config: Partial<WebhookConfig>): void {
    if (config.hubCentralUrl) {
      this.hubCentralUrl = config.hubCentralUrl;
    }

    if (config.webhookSecret) {
      this.webhookSecret = config.webhookSecret;
    }

    if (config.maxRetries !== undefined) {
      this.maxRetries = config.maxRetries;
    }

    if (config.retryDelay !== undefined) {
      this.retryDelay = config.retryDelay;
    }
  }

  /**
   * Obtener estadísticas de webhooks
   */
  getStats(): any {
    // En una implementación real, esto vendría de una base de datos o cache
    return {
      total_sent: 0,
      successful: 0,
      failed: 0,
      retry_count: 0,
      last_sent: null,
      last_error: null,
    };
  }

  /**
   * Registrar evento de webhook
   */
  logWebhookEvent(
    event: string,
    status: "success" | "error",
    details: any,
  ): void {
    console.log(`[WEBHOOK] ${event.toUpperCase()}: ${status}`, details);
    // En producción, esto se guardaría en base de datos para métricas
  }
}

// Exportar instancia singleton
export const webhookService = new WebhookService();
export default webhookService;
