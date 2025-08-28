import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import crypto from "crypto";
import { facturaService } from "@/services/facturaService";
import webhookService from "@/services/webhookService";
import { WebhookOrderData } from "@/types";

export const validateWebhook = [];

export const validateWebhookRetry = [
  body("webhookId").notEmpty().withMessage("ID del webhook es requerido"),
  body("url").isURL().withMessage("URL debe ser válida"),
  body("data").notEmpty().withMessage("Datos del webhook son requeridos"),
];

export interface WebhookRequest extends Request {
  body: {
    order?: WebhookOrderData;
    event_type?: string;
    data?: {
      order_id: number;
      store_id: number;
      customer_id?: number;
      user_id?: number;
      amount: number;
      currency: string;
      items: Array<{
        product_id: number;
        product_name: string;
        quantity: number;
        unit_price: number;
        total: number;
      }>;
      shipping_address?: any;
      delivery_zone_id?: number;
      paid_at: string;
      created_at: string;
      updated_at: string;
      plugins_credentials?: {
        sigo?: {
          apiKey?: string;
          username?: string;
        };
      };
    };
    event?: string;
    timestamp?: number;
  };
  headers: Request["headers"] & {
    "x-hub-signature-256"?: string;
    "x-hub-signature"?: string;
    "user-agent"?: string;
    "content-type"?: string;
  };
}

export interface WebhookRetryRequest extends Request {
  body: {
    webhookId: string;
    url: string;
    data: any;
    retryCount?: number;
  };
}

export interface WebhookStatusRequest extends Request {
  params: {
    webhookId: string;
  };
}

/**
 * Verificar firma HMAC del webhook
 */
const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string,
): boolean => {
  try {
    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex")}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch (error) {
    console.error("Error verificando firma HMAC:", error);
    return false;
  }
};

/**
 * Middleware para verificar la firma del webhook
 */
export const verifySignature = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  try {
    const signature = (req.headers["x-hub-signature-256"] ||
      req.headers["x-hub-signature"]) as string;

    if (!signature) {
      res.status(401).json({ error: "Firma HMAC no proporcionada" });
      return;
    }

    const headerApiKey = (req.headers["x-api-key"] as string) || "";
    const secret =
      process.env.APISIGO_WEBHOOK_SECRET ||
      headerApiKey ||
      process.env.WEBHOOK_SECRET ||
      "default-secret";

    const payload = (req as any).rawBody
      ? (req as any).rawBody.toString()
      : JSON.stringify(req.body);

    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(payload, "utf8")
      .digest("hex")}`;

    const isValid = (() => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature),
        );
      } catch {
        return signature === expectedSignature;
      }
    })();

    if (!isValid) {
      res.status(401).json({ error: "Firma HMAC inválida" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Error verificando firma del webhook" });
  }
};

/**
 * Procesar webhook de orden
 */
export const processOrderWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res
        .status(400)
        .json({ error: "Datos inválidos", details: errors.array() });
      return;
    }

    const isGrafWebhook = Boolean(
      (req.body as any).event_type && (req.body as any).data,
    );
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let orderData: any;
    let event: string;
    let sigoCredentials: any;

    if (isGrafWebhook) {
      const grafData = (req.body as any).data;
      event = (req.body as any).event_type;
      sigoCredentials = grafData?.plugins_credentials?.sigo;

      console.log(
        `[${webhookId}] Procesando webhook de Graf - orden: ${grafData.order_id}, evento: ${event}`,
      );
      console.log(
        `[${webhookId}] DEBUG - Estructura del webhook de Graf:`,
        JSON.stringify(grafData, null, 2),
      );

      orderData = {
        order_id: grafData.order_id,
        store_id: grafData.store_id,
        customer_id: grafData.customer_id || grafData.user_id,
        amount: grafData.amount,
        currency: grafData.currency || "COP",
        items: (grafData.items || []).map((item: any) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
        })),
        paid_at: grafData.paid_at,
        customer_name: "Cliente Graf",
        shipping_address: grafData.shipping_address,
      };
    } else {
      const {
        orderData: hubOrderData,
        eventType,
        sigoCredentials: hubCreds,
      } = req.body as {
        orderData: WebhookOrderData;
        eventType: string;
        sigoCredentials?: { apiKey?: string; username?: string };
      };
      event = eventType;
      sigoCredentials = hubCreds;
      orderData = hubOrderData;
      console.log(
        `[${webhookId}] Procesando webhook de HubCentral - orden: ${orderData?.order_id}, evento: ${event}`,
      );
    }

    switch (event) {
      case "order.created":
      case "order.completed":
      case "order.paid": {
        try {
          console.log(`[${webhookId}] DEBUG - Credenciales SIGO recibidas:`, {
            hasApiKey: !!sigoCredentials?.apiKey,
            hasUsername: !!sigoCredentials?.username,
            apiKeyStart: sigoCredentials?.apiKey
              ? `${sigoCredentials.apiKey.substring(0, 10)}...`
              : "N/A",
          });

          const facturaResult = await facturaService.crearFacturaDesdeWebhook(
            orderData,
            sigoCredentials,
          );

          const facturaDataForWebhook = {
            factura_id: facturaResult.factura_id,
            documento_sigo_id: facturaResult.sigo_id || facturaResult.factura_id,
            numero_documento: facturaResult.numero_factura || facturaResult.numero || "001",
            estado: facturaResult.estado || "CREADO",
            orden_graf: orderData.order_id,
            monto_facturado: orderData.amount,
            pdf_url: facturaResult.pdf_url || "",
            xml_url: facturaResult.xml_url || "",
          };

          await webhookService.enviarFacturaCreada(facturaDataForWebhook);

          res.status(200).json({
            success: true,
            message: "Webhook procesado exitosamente",
            data: {
              webhookId,
              orderId: orderData.order_id,
              event,
              facturaResult,
            },
          });
        } catch (facturaError) {
          console.error(`[${webhookId}] Error creando factura:`, facturaError);
          await webhookService.enviarError(orderData.order_id, {
            error: "Error creando factura",
            details:
              facturaError instanceof Error
                ? facturaError.message
                : "Unknown error",
          });
          res.status(500).json({
            error: "Error procesando la orden",
            webhookId,
            details:
              facturaError instanceof Error
                ? facturaError.message
                : "Unknown error",
          });
        }
        break;
      }

      case "order.cancelled":
      case "order.canceled": {
        const cancelOrderId = orderData.order_id;
        console.log(
          `[${webhookId}] Procesando cancelación de orden: ${cancelOrderId}`,
        );
        res.status(200).json({
          success: true,
          message: "Cancelación procesada",
          data: { webhookId, orderId: cancelOrderId, event },
        });
        break;
      }

      case "order.refunded": {
        const refundOrderId = orderData.order_id;
        console.log(
          `[${webhookId}] Procesando reembolso de orden: ${refundOrderId}`,
        );
        res.status(200).json({
          success: true,
          message: "Reembolso procesado",
          data: { webhookId, orderId: refundOrderId, event },
        });
        break;
      }

      default:
        console.log(`[${webhookId}] Evento no reconocido: ${event}`);
        res.status(400).json({ error: "Tipo de evento no soportado", event });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Reintentar webhook
 */
export const retryWebhook = async (
  req: WebhookRetryRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: "Datos inválidos",
        details: errors.array(),
      });
      return;
    }

    const { webhookId, url, data, retryCount = 0 } = req.body;

    console.log(
      `Reintentando webhook ${webhookId}, intento: ${retryCount + 1}`,
    );

    const result = await webhookService.enviarWebhookConReintentos(url, data, {
      maxIntentos: 3,
      delayBase: 1000,
      timeout: 5000,
    });

    res.json({
      success: true,
      message: "Webhook reintentado exitosamente",
      data: {
        webhookId,
        retryCount: retryCount + 1,
        result,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener estado del webhook
 */
export const getWebhookStatus = async (
  req: WebhookStatusRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { webhookId } = req.params;

    res.json({
      success: true,
      data: {
        webhookId,
        status: "completed",
        timestamp: new Date().toISOString(),
        attempts: 1,
        lastAttempt: new Date().toISOString(),
        nextRetry: null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Listar webhooks pendientes
 */
export const getPendingWebhooks = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    res.json({
      success: true,
      data: {
        webhooks: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Health check del sistema de webhooks
 */
export const healthCheck = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const timestamp = new Date().toISOString();

    res.json({
      success: true,
      service: "Webhook Controller",
      timestamp,
      status: "healthy",
      endpoints: {
        process: "/api/webhooks/order",
        retry: "/api/webhooks/retry",
        status: "/api/webhooks/:webhookId/status",
        pending: "/api/webhooks/pending",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      service: "Webhook Controller",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
