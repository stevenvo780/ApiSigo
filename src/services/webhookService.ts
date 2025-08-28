/**
 * DEPRECATED: WebhookService
 *
 * La API se simplificó y ya no envía webhooks salientes.
 * Mantener este stub evita romper imports antiguos mientras migramos.
 *
 * Recomendación: manejar la lógica directamente en los controladores
 * específicos (clientes, facturas) y eliminar esta dependencia cuando sea posible.
 */

export type HealthCheckResult = {
  status: "healthy" | "unhealthy";
  timestamp: string;
  services?: Record<string, string>;
  response_time_ms?: number;
  errors?: string[];
};

export class WebhookService {
  // Compatibilidad mínima con firmas antiguas
  generarFirmaHMAC(_payload: object, _secret: string): string {
    throw new Error("WebhookService está deprecated: firmas no disponibles");
  }

  async enviarFacturaCreada(_facturaData: any): Promise<boolean> {
    // No-op: webhooks salientes deshabilitados
    return false;
  }

  async enviarError(
    _orderId: string,
    _errorData: { error: string; details: string },
  ): Promise<void> {
    // No-op
    return;
  }

  async enviarWebhookConReintentos(
    _url: string,
    _payload: any,
    _opciones: {
      maxIntentos?: number;
      delayBase?: number;
      timeout?: number;
    } = {},
  ): Promise<any> {
    // No-op
    return null;
  }

  async enviarWebhook(_eventType: string, _data: any): Promise<any> {
    // No-op
    return null;
  }

  generarFirma(_payload: object): string {
    throw new Error("WebhookService está deprecated: firmas no disponibles");
  }

  validarFirma(_payload: object, _receivedSignature: string): boolean {
    // No-op
    return false;
  }

  validateConfig(): boolean {
    // Siempre true para no bloquear arranque
    return true;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: { webhook: "disabled" },
      response_time_ms: 0,
    };
  }

  getConfig() {
    return {
      webhookSecret: undefined,
      hubCentralUrl: undefined,
      maxRetries: 0,
      retryDelay: 0,
      backoff: { initial: 0, multiplier: 0, max: 0 },
      disabled: true,
    } as any;
  }

  updateConfig(_config: any): void {
    // No-op
  }

  getStats(): any {
    return {
      total_sent: 0,
      successful: 0,
      failed: 0,
      retry_count: 0,
      last_sent: null,
      last_error: null,
      disabled: true,
    };
  }

  logWebhookEvent(
    _event: string,
    _status: "success" | "error",
    _details: any,
  ): void {
    // No-op
  }
}

export const webhookService = new WebhookService();
export default webhookService;
