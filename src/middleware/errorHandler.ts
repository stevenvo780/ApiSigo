import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

/**
 * Middleware para manejo centralizado de errores
 */
export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error capturado:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  // Error de validación
  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Error de validación',
      details: error.details || error.message
    });
    return;
  }

  // Error de autenticación
  if (error.name === 'UnauthorizedError' || error.statusCode === 401) {
    res.status(401).json({
      success: false,
      error: 'No autorizado',
      message: 'Credenciales inválidas o token expirado'
    });
    return;
  }

  // Error de permisos
  if (error.statusCode === 403) {
    res.status(403).json({
      success: false,
      error: 'Acceso prohibido',
      message: 'No tienes permisos para realizar esta acción'
    });
    return;
  }

  // Error de recurso no encontrado
  if (error.statusCode === 404) {
    res.status(404).json({
      success: false,
      error: 'Recurso no encontrado',
      message: error.message || 'El recurso solicitado no existe'
    });
    return;
  }

  // Error de conflicto
  if (error.statusCode === 409) {
    res.status(409).json({
      success: false,
      error: 'Conflicto',
      message: error.message || 'El recurso ya existe o hay un conflicto'
    });
    return;
  }

  // Error de rate limiting
  if (error.statusCode === 429) {
    res.status(429).json({
      success: false,
      error: 'Demasiadas solicitudes',
      message: 'Has excedido el límite de solicitudes. Intenta más tarde.'
    });
    return;
  }

  // Errores específicos de SIGO
  if (error.code === 'SIGO_API_ERROR') {
    res.status(502).json({
      success: false,
      error: 'Error del servicio SIGO',
      message: 'Hubo un problema comunicándose con SIGO',
      details: error.details
    });
    return;
  }

  // Errores de timeout
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    res.status(504).json({
      success: false,
      error: 'Timeout',
      message: 'La operación tardó demasiado tiempo en completarse'
    });
    return;
  }

  // Errores de conexión
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    res.status(503).json({
      success: false,
      error: 'Servicio no disponible',
      message: 'No se pudo conectar con el servicio externo'
    });
    return;
  }

  // Error interno del servidor (default)
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'production' 
      ? 'Ocurrió un error inesperado' 
      : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
};

/**
 * Middleware para capturar errores asincrónicos
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Middleware para rutas no encontradas
 */
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error: ApiError = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Crear error personalizado
 */
export const createError = (message: string, statusCode: number = 500, code?: string, details?: any): ApiError => {
  const error: ApiError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
};

/**
 * Middleware de logging de requests
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

/**
 * Middleware para validar JSON
 */
export const validateJson = (error: any, req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      success: false,
      error: 'JSON inválido',
      message: 'El cuerpo de la solicitud contiene JSON malformado'
    });
    return;
  }
  next();
};
