/**
 * Sistema de logging estructurado para integraciones
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation?: string;
  message: string;
  correlationId?: string;
  userId?: string;
  tenantId?: string;
  metadata?: Record<string, any>;
  duration?: number;
  statusCode?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LoggerConfig {
  service: string;
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableStructured: boolean;
  sensitiveFields: string[];
  maxMetadataSize: number;
}

/**
 * Logger estructurado thread-safe
 */
export class StructuredLogger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      service: 'integration-service',
      level: process.env.LOG_LEVEL ? this.parseLogLevel(process.env.LOG_LEVEL) : LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      enableStructured: true,
      sensitiveFields: ['apiKey', 'password', 'secret', 'authorization', 'x-api-key'],
      maxMetadataSize: 10000, // 10KB max
      ...config
    };
  }

  /**
   * Log de error
   */
  error(message: string, options: Partial<LogEntry> = {}): void {
    this.log(LogLevel.ERROR, message, options);
  }

  /**
   * Log de warning
   */
  warn(message: string, options: Partial<LogEntry> = {}): void {
    this.log(LogLevel.WARN, message, options);
  }

  /**
   * Log de información
   */
  info(message: string, options: Partial<LogEntry> = {}): void {
    this.log(LogLevel.INFO, message, options);
  }

  /**
   * Log de debug
   */
  debug(message: string, options: Partial<LogEntry> = {}): void {
    this.log(LogLevel.DEBUG, message, options);
  }

  /**
   * Log de trace
   */
  trace(message: string, options: Partial<LogEntry> = {}): void {
    this.log(LogLevel.TRACE, message, options);
  }

  /**
   * Log de operación (incluye duración automáticamente)
   */
  operation(operation: string, message: string, duration: number, options: Partial<LogEntry> = {}): void {
    this.log(LogLevel.INFO, message, {
      operation,
      duration,
      ...options
    });
  }

  /**
   * Log de request HTTP
   */
  httpRequest(method: string, url: string, statusCode: number, duration: number, options: Partial<LogEntry> = {}): void {
    const level = statusCode >= 400 ? LogLevel.ERROR : statusCode >= 300 ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(level, `${method} ${url} ${statusCode} ${duration}ms`, {
      operation: 'http_request',
      statusCode,
      duration,
      metadata: {
        method,
        url: this.sanitizeUrl(url),
        ...options.metadata
      },
      ...options
    });
  }

  /**
   * Log de autenticación
   */
  auth(success: boolean, service: string, duration: number, options: Partial<LogEntry> = {}): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    const message = `Authentication ${success ? 'successful' : 'failed'} for ${service} (${duration}ms)`;
    
    this.log(level, message, {
      operation: 'authentication',
      duration,
      metadata: {
        service,
        success,
        ...options.metadata
      },
      ...options
    });
  }

  /**
   * Log de circuit breaker
   */
  circuitBreaker(service: string, state: string, options: Partial<LogEntry> = {}): void {
    const level = state === 'OPEN' ? LogLevel.ERROR : state === 'HALF_OPEN' ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(level, `Circuit breaker for ${service} is now ${state}`, {
      operation: 'circuit_breaker_state_change',
      metadata: {
        service,
        state,
        ...options.metadata
      },
      ...options
    });
  }

  /**
   * Método principal de logging
   */
  private log(level: LogLevel, message: string, options: Partial<LogEntry> = {}): void {
    // Verificar si debe loggear este nivel
    if (level > this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.config.service,
      message,
      ...options
    };

    // Sanitizar datos sensibles
    if (entry.metadata) {
      entry.metadata = this.sanitizeMetadata(entry.metadata);
      
      // Limitar tamaño de metadata
      const metadataStr = JSON.stringify(entry.metadata);
      if (metadataStr.length > this.config.maxMetadataSize) {
        entry.metadata = {
          ...entry.metadata,
          _truncated: true,
          _originalSize: metadataStr.length
        };
        // Mantener solo los campos más importantes
        const importantFields = ['operation', 'statusCode', 'duration', 'success', 'error'];
        const truncatedMetadata: Record<string, any> = {};
        
        for (const field of importantFields) {
          if (entry.metadata[field] !== undefined) {
            truncatedMetadata[field] = entry.metadata[field];
          }
        }
        
        entry.metadata = truncatedMetadata;
      }
    }

    // Output basado en configuración
    if (this.config.enableConsole) {
      this.outputConsole(entry);
    }

    if (this.config.enableFile && this.config.filePath) {
      this.outputFile(entry);
    }
  }

  /**
   * Output a consola
   */
  private outputConsole(entry: LogEntry): void {
    if (this.config.enableStructured) {
      // JSON estructurado
      console.log(JSON.stringify(entry));
    } else {
      // Formato legible para desarrollo
      const levelName = LogLevel[entry.level];
      const timestamp = entry.timestamp;
      const service = entry.service;
      const operation = entry.operation ? `:${entry.operation}` : '';
      const duration = entry.duration ? ` (${entry.duration}ms)` : '';
      const statusCode = entry.statusCode ? ` [${entry.statusCode}]` : '';
      
      const prefix = `[${timestamp}] ${levelName} ${service}${operation}${statusCode}${duration}`;
      const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata, null, 2)}` : '';
      
      console.log(`${prefix} ${entry.message}${metadata}`);
      
      if (entry.error?.stack) {
        console.log(entry.error.stack);
      }
    }
  }

  /**
   * Output a archivo (implementación básica)
   */
  private outputFile(entry: LogEntry): void {
    try {
      const fs = require('fs');
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.config.filePath!, logLine);
    } catch (error) {
      // Fallback a consola si no se puede escribir archivo
      console.error('Failed to write to log file:', error);
      this.outputConsole(entry);
    }
  }

  /**
   * Sanitizar datos sensibles
   */
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized = { ...metadata };
    
    for (const field of this.config.sensitiveFields) {
      if (sanitized[field]) {
        if (typeof sanitized[field] === 'string') {
          const value = sanitized[field] as string;
          sanitized[field] = value.length > 10 
            ? value.substring(0, 6) + '***' + value.substring(value.length - 2)
            : '***';
        } else {
          sanitized[field] = '***';
        }
      }
    }

    // Sanitizar objetos anidados
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMetadata(value);
      }
    }

    return sanitized;
  }

  /**
   * Sanitizar URLs (remover query params sensibles)
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const sensitiveParams = ['api_key', 'apikey', 'token', 'password', 'secret'];
      
      for (const param of sensitiveParams) {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, '***');
        }
      }
      
      return urlObj.toString();
    } catch {
      // Si no es una URL válida, retornar como está
      return url;
    }
  }

  /**
   * Parse del nivel de log desde string
   */
  private parseLogLevel(level: string): LogLevel {
    const upperLevel = level.toUpperCase();
    switch (upperLevel) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': case 'WARNING': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      case 'TRACE': return LogLevel.TRACE;
      default: return LogLevel.INFO;
    }
  }

  /**
   * Crear child logger con contexto adicional
   */
  child(context: Partial<LogEntry>): StructuredLogger {
    const childLogger = new StructuredLogger(this.config);
    const originalLog = childLogger.log.bind(childLogger);
    
    childLogger.log = (level: LogLevel, message: string, options: Partial<LogEntry> = {}) => {
      originalLog(level, message, { ...context, ...options });
    };
    
    return childLogger;
  }

  /**
   * Crear contexto de operación con timing automático
   */
  createOperationContext(operation: string, correlationId?: string): OperationLogger {
    return new OperationLogger(this, operation, correlationId);
  }
}

/**
 * Logger específico para operaciones con timing automático
 */
export class OperationLogger {
  private startTime: number;
  private operation: string;
  private correlationId?: string;
  private logger: StructuredLogger;

  constructor(logger: StructuredLogger, operation: string, correlationId?: string) {
    this.logger = logger;
    this.operation = operation;
    this.correlationId = correlationId;
    this.startTime = Date.now();
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.logger.info(message, {
      operation: this.operation,
      correlationId: this.correlationId,
      metadata
    });
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.logger.error(message, {
      operation: this.operation,
      correlationId: this.correlationId,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      } : undefined,
      metadata
    });
  }

  success(message: string, metadata?: Record<string, any>): void {
    const duration = Date.now() - this.startTime;
    this.logger.operation(this.operation, `${message} (${duration}ms)`, duration, {
      correlationId: this.correlationId,
      metadata: {
        success: true,
        ...metadata
      }
    });
  }

  failure(message: string, error?: Error, metadata?: Record<string, any>): void {
    const duration = Date.now() - this.startTime;
    this.logger.operation(this.operation, `${message} (${duration}ms)`, duration, {
      correlationId: this.correlationId,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      } : undefined,
      metadata: {
        success: false,
        ...metadata
      }
    });
  }
}

/**
 * Logger global por defecto
 */
export const defaultLogger = new StructuredLogger({
  service: process.env.SERVICE_NAME || 'integration-service',
  enableStructured: process.env.NODE_ENV === 'production',
  enableFile: process.env.NODE_ENV === 'production',
  filePath: process.env.LOG_FILE_PATH || './logs/app.log'
});

/**
 * Factory para crear loggers específicos por servicio
 */
export class LoggerFactory {
  private static loggers = new Map<string, StructuredLogger>();

  static getLogger(service: string, config?: Partial<LoggerConfig>): StructuredLogger {
    if (!this.loggers.has(service)) {
      this.loggers.set(service, new StructuredLogger({
        service,
        ...config
      }));
    }
    return this.loggers.get(service)!;
  }

  static getSigoLogger(): StructuredLogger {
    return this.getLogger('sigo-service', {
      enableStructured: true,
      level: LogLevel.INFO
    });
  }

  static getSoftiaLogger(): StructuredLogger {
    return this.getLogger('softia-service', {
      enableStructured: true,
      level: LogLevel.INFO
    });
  }

  static getWebhookLogger(): StructuredLogger {
    return this.getLogger('webhook-service', {
      enableStructured: true,
      level: LogLevel.DEBUG // Más detalle para webhooks
    });
  }
}