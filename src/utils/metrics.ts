/**
 * Sistema de métricas y monitoreo para integraciones
 */

export interface MetricData {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface Counter extends MetricData {
  type: "counter";
}

export interface Gauge extends MetricData {
  type: "gauge";
}

export interface Histogram extends MetricData {
  type: "histogram";
  buckets?: number[];
}

export type Metric = Counter | Gauge | Histogram;

export interface MetricsSnapshot {
  timestamp: number;
  metrics: Record<string, Metric[]>;
  summary: {
    totalRequests: number;
    totalErrors: number;
    avgResponseTime: number;
    errorRate: number;
  };
}

/**
 * Collector de métricas thread-safe
 */
export class MetricsCollector {
  private metrics = new Map<string, Metric[]>();
  private readonly maxMetricsPerKey = 1000;

  /**
   * Incrementa un contador
   */
  incrementCounter(
    name: string,
    value: number = 1,
    labels?: Record<string, string>,
    metadata?: Record<string, any>,
  ): void {
    const metric: Counter = {
      type: "counter",
      timestamp: Date.now(),
      value,
      labels,
      metadata,
    };

    this.addMetric(name, metric);
  }

  /**
   * Establece un gauge (valor instantáneo)
   */
  setGauge(
    name: string,
    value: number,
    labels?: Record<string, string>,
    metadata?: Record<string, any>,
  ): void {
    const metric: Gauge = {
      type: "gauge",
      timestamp: Date.now(),
      value,
      labels,
      metadata,
    };

    this.addMetric(name, metric);
  }

  /**
   * Registra un histograma (para tiempos de respuesta, tamaños, etc.)
   */
  recordHistogram(
    name: string,
    value: number,
    buckets?: number[],
    labels?: Record<string, string>,
    metadata?: Record<string, any>,
  ): void {
    const metric: Histogram = {
      type: "histogram",
      timestamp: Date.now(),
      value,
      buckets,
      labels,
      metadata,
    };

    this.addMetric(name, metric);
  }

  /**
   * Agrega una métrica al store
   */
  private addMetric(name: string, metric: Metric): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricsList = this.metrics.get(name)!;
    metricsList.push(metric);


    if (metricsList.length > this.maxMetricsPerKey) {
      metricsList.shift();
    }
  }

  /**
   * Obtiene snapshot completo de métricas
   */
  getSnapshot(): MetricsSnapshot {
    const timestamp = Date.now();
    const metrics: Record<string, Metric[]> = {};


    for (const [name, metricsList] of this.metrics) {
      metrics[name] = [...metricsList];
    }


    const summary = this.calculateSummary();

    return {
      timestamp,
      metrics,
      summary,
    };
  }

  /**
   * Calcula estadísticas resumidas
   */
  private calculateSummary(): MetricsSnapshot["summary"] {
    const requestMetrics = this.metrics.get("api.requests.total") || [];
    const errorMetrics = this.metrics.get("api.errors.total") || [];
    const responseTimeMetrics = this.metrics.get("api.response_time") || [];

    const totalRequests = requestMetrics.reduce((sum, m) => sum + m.value, 0);
    const totalErrors = errorMetrics.reduce((sum, m) => sum + m.value, 0);

    const responseTimesValues = responseTimeMetrics.map((m) => m.value);
    const avgResponseTime =
      responseTimesValues.length > 0
        ? responseTimesValues.reduce((sum, val) => sum + val, 0) /
          responseTimesValues.length
        : 0;

    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    return {
      totalRequests,
      totalErrors,
      avgResponseTime,
      errorRate,
    };
  }

  /**
   * Obtiene métricas específicas por nombre
   */
  getMetrics(name: string): Metric[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Limpia métricas antiguas (más de X tiempo)
   */
  cleanup(olderThanMs: number = 3600000): void {

    const cutoffTime = Date.now() - olderThanMs;

    for (const [name, metricsList] of this.metrics) {
      const filtered = metricsList.filter((m) => m.timestamp > cutoffTime);
      this.metrics.set(name, filtered);
    }
  }

  /**
   * Resetea todas las métricas
   */
  reset(): void {
    this.metrics.clear();
  }

  /**
   * Obtiene nombres de todas las métricas disponibles
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }
}

/**
 * Singleton global de métricas
 */
export const globalMetrics = new MetricsCollector();

/**
 * Decorador para medir tiempo de ejecución de métodos
 */
export function measureExecutionTime(metricName?: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value;
    const finalMetricName =
      metricName ||
      `method.${target.constructor.name}.${propertyName}.duration`;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let success = true;
      let error: Error | undefined;

      try {
        const result = await method.apply(this, args);
        return result;
      } catch (err) {
        success = false;
        error = err as Error;
        throw err;
      } finally {
        const duration = Date.now() - startTime;

        globalMetrics.recordHistogram(finalMetricName, duration, undefined, {
          method: propertyName,
          class: target.constructor.name,
          success: success ? "true" : "false",
        });

        globalMetrics.incrementCounter(
          `method.${target.constructor.name}.${propertyName}.calls`,
          1,
          {
            success: success ? "true" : "false",
            error: error?.name || "none",
          },
        );
      }
    };

    return descriptor;
  };
}

/**
 * Helper para métricas de API
 */
export class ApiMetrics {
  static recordRequest(
    service: string,
    operation: string,
    method: string = "POST",
  ): void {
    globalMetrics.incrementCounter("api.requests.total", 1, {
      service,
      operation,
      method,
    });
  }

  static recordResponse(
    service: string,
    operation: string,
    statusCode: number,
    responseTimeMs: number,
  ): void {
    const success = statusCode >= 200 && statusCode < 400;

    globalMetrics.recordHistogram(
      "api.response_time",
      responseTimeMs,
      undefined,
      {
        service,
        operation,
        status_code: statusCode.toString(),
        success: success.toString(),
      },
    );

    globalMetrics.incrementCounter("api.responses.total", 1, {
      service,
      operation,
      status_code: statusCode.toString(),
      success: success.toString(),
    });

    if (!success) {
      globalMetrics.incrementCounter("api.errors.total", 1, {
        service,
        operation,
        status_code: statusCode.toString(),
      });
    }
  }

  static recordError(
    service: string,
    operation: string,
    errorType: string,
    errorMessage?: string,
  ): void {
    globalMetrics.incrementCounter("api.errors.total", 1, {
      service,
      operation,
      error_type: errorType,
    });

    globalMetrics.incrementCounter(
      `api.errors.${errorType}`,
      1,
      {
        service,
        operation,
      },
      {
        message: errorMessage?.substring(0, 200),
      },
    );
  }

  static recordCircuitBreakerState(service: string, state: string): void {
    globalMetrics.setGauge(
      "circuit_breaker.state",
      state === "CLOSED" ? 0 : state === "HALF_OPEN" ? 1 : 2,
      { service },
      { state },
    );
  }

  static recordAuthentication(
    service: string,
    success: boolean,
    durationMs: number,
  ): void {
    globalMetrics.recordHistogram("auth.duration", durationMs, undefined, {
      service,
      success: success.toString(),
    });

    globalMetrics.incrementCounter("auth.attempts.total", 1, {
      service,
      success: success.toString(),
    });
  }

  static recordValidation(
    service: string,
    field: string,
    success: boolean,
  ): void {
    globalMetrics.incrementCounter("validation.attempts.total", 1, {
      service,
      field,
      success: success.toString(),
    });
  }
}

/**
 * Middleware para Express que registra métricas HTTP
 */
export function metricsMiddleware(req: any, res: any, next: any): void {
  const startTime = Date.now();

  globalMetrics.incrementCounter("http.requests.total", 1, {
    method: req.method,
    path: req.route?.path || req.path,
    user_agent: req.get("User-Agent")?.substring(0, 50) || "unknown",
  });


  const originalEnd = res.end;
  res.end = function (...args: any[]) {
    const duration = Date.now() - startTime;

    globalMetrics.recordHistogram(
      "http.request_duration",
      duration,
      undefined,
      {
        method: req.method,
        path: req.route?.path || req.path,
        status_code: res.statusCode.toString(),
      },
    );

    globalMetrics.incrementCounter("http.responses.total", 1, {
      method: req.method,
      path: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
    });

    originalEnd.apply(this, args);
  };

  next();
}

/**
 * Health check que incluye métricas
 */
export function getHealthWithMetrics(): {
  status: "healthy" | "unhealthy";
  timestamp: string;
  uptime: number;
  metrics: MetricsSnapshot;
} {
  const snapshot = globalMetrics.getSnapshot();
  const isHealthy = snapshot.summary.errorRate < 0.1;

  return {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    metrics: snapshot,
  };
}
