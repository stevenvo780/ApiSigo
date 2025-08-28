import { Request, Response, NextFunction } from "express";

// Webhooks deshabilitados en la API simplificada
export const validateWebhook: any[] = [];
export const validateWebhookRetry: any[] = [];

export const verifySignature = (
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  res.status(410).json({
    success: false,
    error: "Webhooks deshabilitados",
    message:
      "Este endpoint ya no está disponible. Use los endpoints específicos de clientes/facturas.",
  });
};

export const processOrderWebhook = async (
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  res.status(410).json({
    success: false,
    error: "Webhooks deshabilitados",
    message:
      "Este endpoint ya no está disponible. Use los endpoints específicos de clientes/facturas.",
  });
};

export const retryWebhook = async (
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  res.status(410).json({
    success: false,
    error: "Webhooks deshabilitados",
  });
};

export const getWebhookStatus = async (
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  res.status(410).json({
    success: false,
    error: "Webhooks deshabilitados",
  });
};

export const getPendingWebhooks = async (
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  res.status(410).json({
    success: false,
    error: "Webhooks deshabilitados",
  });
};

export const healthCheck = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json({
    success: true,
    service: "Webhook Controller",
    status: "disabled",
    message:
      "Webhooks deshabilitados. Use endpoints por módulo (clientes/facturas).",
    timestamp: new Date().toISOString(),
  });
};
