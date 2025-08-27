/**
 * Configuraciones de timeout para diferentes operaciones
 */

export interface TimeoutConfig {
  connection: number;
  request: number;
  response: number;
  total: number;
}

/**
 * Timeouts para operaciones de Siigo API
 */
export const SIGO_TIMEOUTS = {

  authentication: {
    connection: 5000,
    request: 3000,
    response: 7000,
    total: 15000,
  },


  invoice: {
    connection: 8000,
    request: 5000,
    response: 25000,
    total: 38000,
  },


  client: {
    connection: 6000,
    request: 4000,
    response: 15000,
    total: 25000,
  },


  healthCheck: {
    connection: 2000,
    request: 1000,
    response: 2000,
    total: 5000,
  },


  default: {
    connection: 5000,
    request: 3000,
    response: 12000,
    total: 20000,
  },
} as const;

/**
 * Timeouts para operaciones de Softia API
 */
export const SOFTIA_TIMEOUTS = {

  clientSync: {
    connection: 8000,
    request: 5000,
    response: 20000,
    total: 33000,
  },


  clientOps: {
    connection: 5000,
    request: 3000,
    response: 10000,
    total: 18000,
  },


  tags: {
    connection: 3000,
    request: 2000,
    response: 5000,
    total: 10000,
  },


  search: {
    connection: 6000,
    request: 3000,
    response: 15000,
    total: 24000,
  },


  default: {
    connection: 5000,
    request: 3000,
    response: 10000,
    total: 18000,
  },
} as const;

/**
 * Timeouts para webhooks (deben ser rápidos)
 */
export const WEBHOOK_TIMEOUTS = {

  orderProcessing: {
    connection: 3000,
    request: 2000,
    response: 8000,
    total: 13000,
  },


  signatureValidation: {
    connection: 1000,
    request: 500,
    response: 1500,
    total: 3000,
  },


  retry: {
    connection: 5000,
    request: 3000,
    response: 12000,
    total: 20000,
  },
} as const;

/**
 * Obtener configuración de timeout por operación
 */
export function getTimeoutConfig(
  service: "sigo" | "softia" | "webhook",
  operation: string,
): TimeoutConfig {
  switch (service) {
    case "sigo":
      switch (operation) {
        case "auth":
        case "authentication":
          return SIGO_TIMEOUTS.authentication;
        case "invoice":
        case "createInvoice":
          return SIGO_TIMEOUTS.invoice;
        case "client":
        case "createClient":
        case "updateClient":
          return SIGO_TIMEOUTS.client;
        case "health":
        case "healthCheck":
          return SIGO_TIMEOUTS.healthCheck;
        default:
          return SIGO_TIMEOUTS.default;
      }

    case "softia":
      switch (operation) {
        case "sync":
        case "clientSync":
          return SOFTIA_TIMEOUTS.clientSync;
        case "client":
        case "createClient":
        case "updateClient":
        case "getClient":
          return SOFTIA_TIMEOUTS.clientOps;
        case "tags":
        case "assignTag":
          return SOFTIA_TIMEOUTS.tags;
        case "search":
        case "findClient":
          return SOFTIA_TIMEOUTS.search;
        default:
          return SOFTIA_TIMEOUTS.default;
      }

    case "webhook":
      switch (operation) {
        case "order":
        case "processOrder":
          return WEBHOOK_TIMEOUTS.orderProcessing;
        case "signature":
        case "validateSignature":
          return WEBHOOK_TIMEOUTS.signatureValidation;
        case "retry":
          return WEBHOOK_TIMEOUTS.retry;
        default:
          return WEBHOOK_TIMEOUTS.orderProcessing;
      }

    default:
      return SIGO_TIMEOUTS.default;
  }
}

/**
 * Crear configuración de axios con timeouts
 */
export function createTimeoutConfig(timeoutConfig: TimeoutConfig) {
  return {
    timeout: timeoutConfig.total,

    headers: {
      Connection: "close",
    },
  };
}
