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
  // Autenticación (crítica, debe ser rápida)
  authentication: {
    connection: 5000,   // 5 segundos para conectar
    request: 3000,      // 3 segundos para enviar request
    response: 7000,     // 7 segundos para recibir response
    total: 15000        // 15 segundos total
  },
  
  // Creación de facturas (operación más lenta)
  invoice: {
    connection: 8000,   // 8 segundos para conectar
    request: 5000,      // 5 segundos para enviar request
    response: 25000,    // 25 segundos para recibir response (SUNAT puede tardar)
    total: 38000        // 38 segundos total
  },
  
  // Operaciones de clientes (intermedio)
  client: {
    connection: 6000,   // 6 segundos para conectar
    request: 4000,      // 4 segundos para enviar request
    response: 15000,    // 15 segundos para recibir response
    total: 25000        // 25 segundos total
  },
  
  // Health check (debe ser muy rápido)
  healthCheck: {
    connection: 2000,   // 2 segundos para conectar
    request: 1000,      // 1 segundo para enviar request
    response: 2000,     // 2 segundos para recibir response
    total: 5000         // 5 segundos total
  },
  
  // Operaciones generales (por defecto)
  default: {
    connection: 5000,   // 5 segundos para conectar
    request: 3000,      // 3 segundos para enviar request
    response: 12000,    // 12 segundos para recibir response
    total: 20000        // 20 segundos total
  }
} as const;

/**
 * Timeouts para operaciones de Softia API
 */
export const SOFTIA_TIMEOUTS = {
  // Sincronización de clientes (puede ser lenta)
  clientSync: {
    connection: 8000,   // 8 segundos para conectar
    request: 5000,      // 5 segundos para enviar request
    response: 20000,    // 20 segundos para recibir response
    total: 33000        // 33 segundos total
  },
  
  // Operaciones CRUD de clientes (rápidas)
  clientOps: {
    connection: 5000,   // 5 segundos para conectar
    request: 3000,      // 3 segundos para enviar request
    response: 10000,    // 10 segundos para recibir response
    total: 18000        // 18 segundos total
  },
  
  // Gestión de tags (muy rápida)
  tags: {
    connection: 3000,   // 3 segundos para conectar
    request: 2000,      // 2 segundos para enviar request
    response: 5000,     // 5 segundos para recibir response
    total: 10000        // 10 segundos total
  },
  
  // Búsquedas (pueden ser lentas con muchos registros)
  search: {
    connection: 6000,   // 6 segundos para conectar
    request: 3000,      // 3 segundos para enviar request
    response: 15000,    // 15 segundos para recibir response
    total: 24000        // 24 segundos total
  },
  
  // Operaciones generales
  default: {
    connection: 5000,   // 5 segundos para conectar
    request: 3000,      // 3 segundos para enviar request
    response: 10000,    // 10 segundos para recibir response
    total: 18000        // 18 segundos total
  }
} as const;

/**
 * Timeouts para webhooks (deben ser rápidos)
 */
export const WEBHOOK_TIMEOUTS = {
  // Procesamiento de orden (crítico)
  orderProcessing: {
    connection: 3000,   // 3 segundos para conectar
    request: 2000,      // 2 segundos para enviar request
    response: 8000,     // 8 segundos para recibir response
    total: 13000        // 13 segundos total
  },
  
  // Validación de firma (muy rápido)
  signatureValidation: {
    connection: 1000,   // 1 segundo para conectar
    request: 500,       // 0.5 segundos para enviar request
    response: 1500,     // 1.5 segundos para recibir response
    total: 3000         // 3 segundos total
  },
  
  // Reintentos (más tiempo)
  retry: {
    connection: 5000,   // 5 segundos para conectar
    request: 3000,      // 3 segundos para enviar request
    response: 12000,    // 12 segundos para recibir response
    total: 20000        // 20 segundos total
  }
} as const;

/**
 * Obtener configuración de timeout por operación
 */
export function getTimeoutConfig(service: 'sigo' | 'softia' | 'webhook', operation: string): TimeoutConfig {
  switch (service) {
    case 'sigo':
      switch (operation) {
        case 'auth':
        case 'authentication':
          return SIGO_TIMEOUTS.authentication;
        case 'invoice':
        case 'createInvoice':
          return SIGO_TIMEOUTS.invoice;
        case 'client':
        case 'createClient':
        case 'updateClient':
          return SIGO_TIMEOUTS.client;
        case 'health':
        case 'healthCheck':
          return SIGO_TIMEOUTS.healthCheck;
        default:
          return SIGO_TIMEOUTS.default;
      }
    
    case 'softia':
      switch (operation) {
        case 'sync':
        case 'clientSync':
          return SOFTIA_TIMEOUTS.clientSync;
        case 'client':
        case 'createClient':
        case 'updateClient':
        case 'getClient':
          return SOFTIA_TIMEOUTS.clientOps;
        case 'tags':
        case 'assignTag':
          return SOFTIA_TIMEOUTS.tags;
        case 'search':
        case 'findClient':
          return SOFTIA_TIMEOUTS.search;
        default:
          return SOFTIA_TIMEOUTS.default;
      }
    
    case 'webhook':
      switch (operation) {
        case 'order':
        case 'processOrder':
          return WEBHOOK_TIMEOUTS.orderProcessing;
        case 'signature':
        case 'validateSignature':
          return WEBHOOK_TIMEOUTS.signatureValidation;
        case 'retry':
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
    // Configuraciones adicionales para axios
    headers: {
      'Connection': 'close', // Evitar keep-alive para timeouts más precisos
    }
  };
}