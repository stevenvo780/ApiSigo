/**
 * Circuit Breaker para APIs externas
 * Implementa el patrón Circuit Breaker para prevenir llamadas a servicios que fallan
 */

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Número de fallos consecutivos antes de abrir el circuito
  successThreshold: number;      // Número de éxitos consecutivos para cerrar el circuito
  timeout: number;               // Tiempo en ms antes de intentar cambiar de OPEN a HALF_OPEN
  resetTimeoutMultiplier: number; // Multiplicador para timeout exponencial
  maxTimeout: number;            // Timeout máximo en ms
  onStateChange?: (state: CircuitState, error?: Error) => void;
}

export enum CircuitState {
  CLOSED = 'CLOSED',     // Funcionando normalmente
  OPEN = 'OPEN',         // Circuito abierto, rechazando llamadas
  HALF_OPEN = 'HALF_OPEN' // Permitiendo llamadas limitadas para probar el servicio
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  nextAttempt: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

/**
 * Error lanzado cuando el circuit breaker está abierto
 */
export class CircuitOpenError extends Error {
  public readonly name = 'CircuitOpenError';
  public readonly nextAttemptTime: number;

  constructor(serviceName: string, nextAttemptTime: number) {
    super(`Circuit breaker is OPEN for ${serviceName}. Next attempt at ${new Date(nextAttemptTime).toISOString()}`);
    this.nextAttemptTime = nextAttemptTime;
  }
}

/**
 * Implementación de Circuit Breaker
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = 0;
  private currentTimeout: number;
  
  // Estadísticas
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;

  constructor(
    private readonly serviceName: string,
    private readonly options: CircuitBreakerOptions
  ) {
    this.currentTimeout = options.timeout;
  }

  /**
   * Ejecuta una función con protección del circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Verificar si el circuito está abierto
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new CircuitOpenError(this.serviceName, this.nextAttempt);
      }
      
      // Cambiar a HALF_OPEN para probar el servicio
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      this.onStateChange(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Maneja un resultado exitoso
   */
  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.currentTimeout = this.options.timeout; // Reset timeout
        this.onStateChange(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Maneja una falla
   */
  private onFailure(error: Error): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.successCount = 0; // Reset success count
    
    if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.currentTimeout;
      
      // Aumentar timeout exponencialmente
      this.currentTimeout = Math.min(
        this.currentTimeout * this.options.resetTimeoutMultiplier,
        this.options.maxTimeout
      );
      
      this.onStateChange(CircuitState.OPEN, error);
    }
  }

  /**
   * Maneja cambios de estado
   */
  private onStateChange(newState: CircuitState, error?: Error): void {
    console.log(`[CircuitBreaker:${this.serviceName}] State changed to ${newState}`, {
      previousState: this.state !== newState ? this.state : undefined,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt ? new Date(this.nextAttempt).toISOString() : undefined,
      error: error?.message
    });

    if (this.options.onStateChange) {
      this.options.onStateChange(newState, error);
    }
  }

  /**
   * Obtiene el estado actual del circuit breaker
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Obtiene estadísticas detalladas
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime
    };
  }

  /**
   * Resetea manualmente el circuit breaker (para uso administrativo)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = 0;
    this.currentTimeout = this.options.timeout;
    
    console.log(`[CircuitBreaker:${this.serviceName}] Manually reset to CLOSED state`);
    this.onStateChange(CircuitState.CLOSED);
  }

  /**
   * Fuerza el circuito a estado OPEN (para uso administrativo)
   */
  forceOpen(durationMs: number = this.options.timeout): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + durationMs;
    
    console.log(`[CircuitBreaker:${this.serviceName}] Manually forced to OPEN state for ${durationMs}ms`);
    this.onStateChange(CircuitState.OPEN);
  }
}

/**
 * Factory para crear circuit breakers con configuraciones predefinidas
 */
export class CircuitBreakerFactory {
  private static breakers = new Map<string, CircuitBreaker>();

  /**
   * Obtiene o crea un circuit breaker para un servicio
   */
  static getOrCreate(serviceName: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const defaultOptions: CircuitBreakerOptions = {
        failureThreshold: 5,           // 5 fallos consecutivos
        successThreshold: 3,           // 3 éxitos para cerrar
        timeout: 60000,                // 1 minuto inicial
        resetTimeoutMultiplier: 2,     // Duplicar timeout cada vez
        maxTimeout: 300000,            // Máximo 5 minutos
        onStateChange: (state, error) => {
          console.log(`[CircuitBreakerFactory] ${serviceName} changed to ${state}`, 
                     error ? { error: error.message } : {});
        }
      };

      const finalOptions = { ...defaultOptions, ...options };
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, finalOptions));
    }

    return this.breakers.get(serviceName)!;
  }

  /**
   * Configuraciones específicas por servicio
   */
  static createSigoBreaker(): CircuitBreaker {
    return this.getOrCreate('sigo-api', {
      failureThreshold: 3,           // Siigo es crítico, fallar rápido
      successThreshold: 2,           // Recuperar rápido también
      timeout: 30000,                // 30 segundos inicial
      resetTimeoutMultiplier: 1.5,   // Aumentar más gradualmente
      maxTimeout: 180000             // Máximo 3 minutos
    });
  }

  static createSoftiaBreaker(): CircuitBreaker {
    return this.getOrCreate('softia-api', {
      failureThreshold: 5,           // CRM puede fallar más veces
      successThreshold: 3,           // Necesita más éxitos para recuperar
      timeout: 45000,                // 45 segundos inicial
      resetTimeoutMultiplier: 2,     // Duplicar timeout
      maxTimeout: 300000             // Máximo 5 minutos
    });
  }

  static createHubCentralBreaker(): CircuitBreaker {
    return this.getOrCreate('hubcentral-api', {
      failureThreshold: 4,           // Balance entre crítico y tolerante
      successThreshold: 2,           // Recuperar relativamente rápido
      timeout: 20000,                // 20 segundos inicial
      resetTimeoutMultiplier: 1.8,   // Aumentar gradualmente
      maxTimeout: 120000             // Máximo 2 minutos
    });
  }

  /**
   * Obtiene estadísticas de todos los circuit breakers
   */
  static getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }

  /**
   * Resetea todos los circuit breakers
   */
  static resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    console.log('[CircuitBreakerFactory] All circuit breakers have been reset');
  }
}