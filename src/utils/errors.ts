/**
 * Clases de error personalizadas para manejo robusto de errores
 */

export interface ErrorContext {
  service: string;
  operation: string;
  correlationId?: string;
  userId?: string;
  tenantId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Error base para todas las integraciones
 */
export class IntegrationError extends Error {
  public name = 'IntegrationError';
  public readonly statusCode?: number;
  public readonly originalError?: Error;
  public readonly context: ErrorContext;
  public readonly retryable: boolean;

  constructor(
    message: string, 
    context: ErrorContext,
    options: {
      statusCode?: number;
      originalError?: Error;
      retryable?: boolean;
    } = {}
  ) {
    super(message);
    this.statusCode = options.statusCode;
    this.originalError = options.originalError;
    this.context = context;
    this.retryable = options.retryable ?? false;

    // Mantener el stack trace del error original si existe
    if (options.originalError && options.originalError.stack) {
      this.stack = options.originalError.stack;
    }
  }

  /**
   * Convierte el error a formato JSON para logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }
}

/**
 * Error específico para autenticación
 */
export class AuthenticationError extends IntegrationError {
  public name = 'AuthenticationError';

  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super(message, context, {
      statusCode: 401,
      originalError,
      retryable: true // Los errores de auth pueden ser temporales
    });
  }
}

/**
 * Error específico para validaciones
 */
export class ValidationError extends IntegrationError {
  public name = 'ValidationError';
  public readonly field?: string;

  constructor(message: string, context: ErrorContext, field?: string, originalError?: Error) {
    super(message, context, {
      statusCode: 400,
      originalError,
      retryable: false // Los errores de validación no son reintentables
    });
    this.field = field;
  }
}

/**
 * Error específico para APIs externas
 */
export class ExternalApiError extends IntegrationError {
  public name = 'ExternalApiError';
  public readonly endpoint?: string;
  public readonly responseData?: any;

  constructor(
    message: string, 
    context: ErrorContext, 
    options: {
      statusCode?: number;
      originalError?: Error;
      endpoint?: string;
      responseData?: any;
    } = {}
  ) {
    const isRetryable = options.statusCode ? 
      [429, 502, 503, 504].includes(options.statusCode) || options.statusCode >= 500 :
      false;

    super(message, context, {
      statusCode: options.statusCode,
      originalError: options.originalError,
      retryable: isRetryable
    });

    this.endpoint = options.endpoint;
    this.responseData = options.responseData;
  }
}

/**
 * Error específico para timeouts
 */
export class TimeoutError extends IntegrationError {
  public name = 'TimeoutError';
  public readonly timeoutMs: number;

  constructor(
    message: string, 
    context: ErrorContext, 
    timeoutMs: number,
    originalError?: Error
  ) {
    super(message, context, {
      originalError,
      retryable: true // Los timeouts son reintentables
    });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error específico para rate limiting
 */
export class RateLimitError extends IntegrationError {
  public name = 'RateLimitError';
  public readonly retryAfterMs?: number;

  constructor(
    message: string, 
    context: ErrorContext, 
    retryAfterMs?: number,
    originalError?: Error
  ) {
    super(message, context, {
      statusCode: 429,
      originalError,
      retryable: true
    });
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Utility para crear contexto de error
 */
export function createErrorContext(
  service: string,
  operation: string,
  options: {
    correlationId?: string;
    userId?: string;
    tenantId?: string;
    metadata?: Record<string, any>;
  } = {}
): ErrorContext {
  return {
    service,
    operation,
    timestamp: new Date().toISOString(),
    ...options
  };
}

/**
 * Utility para extraer información de errores de Axios
 */
export function parseAxiosError(error: any): {
  statusCode?: number;
  responseData?: any;
  endpoint?: string;
  isTimeout: boolean;
  isNetworkError: boolean;
} {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return {
      isTimeout: true,
      isNetworkError: false,
      endpoint: error.config?.url
    };
  }

  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
    return {
      isNetworkError: true,
      isTimeout: false,
      endpoint: error.config?.url
    };
  }

  if (error.response) {
    return {
      statusCode: error.response.status,
      responseData: error.response.data,
      endpoint: error.config?.url,
      isTimeout: false,
      isNetworkError: false
    };
  }

  return {
    isTimeout: false,
    isNetworkError: true,
    endpoint: error.config?.url
  };
}

/**
 * Factory para crear errores basados en errores de Axios
 */
export function createErrorFromAxios(
  axiosError: any,
  context: ErrorContext,
  customMessage?: string
): IntegrationError {
  const parsed = parseAxiosError(axiosError);

  if (parsed.isTimeout) {
    return new TimeoutError(
      customMessage || `Timeout en ${context.operation}`,
      context,
      axiosError.config?.timeout || 30000,
      axiosError
    );
  }

  if (parsed.statusCode === 401 || parsed.statusCode === 403) {
    return new AuthenticationError(
      customMessage || `Error de autenticación en ${context.operation}`,
      context,
      axiosError
    );
  }

  if (parsed.statusCode === 429) {
    const retryAfter = parsed.responseData?.retryAfter || 
                      axiosError.response?.headers?.['retry-after'];
    const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;

    return new RateLimitError(
      customMessage || `Rate limit excedido en ${context.operation}`,
      context,
      retryAfterMs,
      axiosError
    );
  }

  if (parsed.statusCode === 400 && parsed.responseData?.field) {
    return new ValidationError(
      customMessage || `Error de validación en ${context.operation}`,
      context,
      parsed.responseData.field,
      axiosError
    );
  }

  return new ExternalApiError(
    customMessage || `Error en API externa durante ${context.operation}`,
    context,
    {
      statusCode: parsed.statusCode,
      originalError: axiosError,
      endpoint: parsed.endpoint,
      responseData: parsed.responseData
    }
  );
}

/**
 * Logger de errores estructurado
 */
export function logError(error: IntegrationError, logger?: any): void {
  const logData = {
    error: error.toJSON(),
    level: 'error',
    timestamp: new Date().toISOString()
  };

  if (logger && typeof logger.error === 'function') {
    logger.error(logData);
  } else {
    console.error(`[${error.context.service}:${error.context.operation}] ${error.name}: ${error.message}`, logData);
  }
}