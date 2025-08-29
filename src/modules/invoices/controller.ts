import { Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import crypto from "crypto";
import { getInvoiceService, CreateInvoiceData } from "./service";
import { RequestWithSigoCredentials } from "@/middleware/sigoCredentials";

export const validateInvoice = [
  body("serie").notEmpty().withMessage("Serie es requerida"),
  body("numero")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Número debe ser un entero positivo"),
  body("fechaEmision")
    .optional()
    .isISO8601()
    .withMessage("Fecha de emisión debe ser válida")
    .custom((value) => {
      if (value) {
        const inputDate = new Date(value);
        const today = new Date();
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (inputDate > today) {
          throw new Error("La fecha de emisión no puede ser futura");
        }
        if (inputDate < yesterday) {
          throw new Error("La fecha de emisión no puede ser muy antigua");
        }
      }
      return true;
    }),
  body("cliente.razonSocial")
    .notEmpty()
    .withMessage("Razón social del cliente es requerida"),
  body("items")
    .isArray({ min: 1 })
    .withMessage("Debe incluir al menos un item"),
  body("items.*.descripcion")
    .notEmpty()
    .withMessage("Descripción del item es requerida"),
  body("items.*.cantidad")
    .isFloat({ min: 0 })
    .withMessage("Cantidad debe ser mayor a 0"),
  body("items.*.precioUnitario")
    .isFloat({ min: 0 })
    .withMessage("Precio unitario debe ser mayor a 0"),
  body("totales.total")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Total debe ser mayor a 0"),
];

export const validateInvoiceParams = [
  param("serie").notEmpty().withMessage("Serie es requerida"),
  param("numero").notEmpty().withMessage("Número es requerido"),
];

export interface InvoiceRequest extends RequestWithSigoCredentials {
  body: CreateInvoiceData;
}

export interface InvoiceParamsRequest extends RequestWithSigoCredentials {
  params: {
    serie: string;
    numero: string;
  };
}

export const validateWebhookInvoice = [
  body("event_type")
    .equals("pedido.pagado")
    .withMessage("Tipo de evento debe ser pedido.pagado"),
  body("data.items")
    .isArray({ min: 1 })
    .withMessage("Debe incluir al menos un item"),
  body("data.amount")
    .isNumeric()
    .custom((v) => v > 0)
    .withMessage("Monto debe ser mayor a 0"),
];

const verifyWebhookSignature = (payload: any, signature?: string): boolean => {
  if (!signature) return false;
  const secret = process.env.HUB_WEBHOOK_SECRET || "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  const provided = signature.replace("sha256=", "");
  return provided === expected;
};

export const createInvoiceFromWebhook = async (
  req: RequestWithSigoCredentials & Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res
        .status(400)
        .json({
          error: "Datos inválidos",
          details: errors.array(),
        });
      return;
    }

    if (!req.sigoAuthHeaders) {
      res
        .status(401)
        .json({
          error: "No autenticado",
          message: "Faltan headers de autenticación de SIGO",
        });
      return;
    }

    const signature = (req.headers["x-hub-signature"] as string) || "";
    if (!verifyWebhookSignature(req.body, signature)) {
      res.status(401).json({ error: "Firma de webhook inválida" });
      return;
    }

    const invoiceService = getInvoiceService();
    const result = await invoiceService.createInvoiceFromWebhook(
      (req.body as any).data,
      req.sigoAuthHeaders,
    );

    res.status(200).json({
      status: "success",
      factura_id: result.id || result.numero_documento,
      numero_factura: result.number || result.numero_documento,
      estado: "CREADA",
      sigo_id: result.id,
      pdf_url: result.pdf_url,
      xml_url: result.xml_url,
    });
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (
  req: InvoiceRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res
        .status(400)
        .json({
          error: "Datos inválidos",
          details: errors.array(),
        });
      return;
    }

    if (!req.sigoAuthHeaders) {
      res
        .status(401)
        .json({
          error: "No autenticado",
          message: "Faltan headers de autenticación de SIGO",
        });
      return;
    }

    const invoiceData = req.body;
    const invoiceService = getInvoiceService();

    const result = await invoiceService.createInvoice(
      invoiceData,
      req.sigoAuthHeaders,
    );

    res
      .status(201)
      .json({
        success: true,
        message: "Factura creada exitosamente",
        data: result,
      });
  } catch (error) {
    next(error);
  }
};

export const cancelInvoice = async (
  req: InvoiceParamsRequest,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res
        .status(400)
        .json({
          error: "Parámetros inválidos",
          details: errors.array(),
        });
      return;
    }

    if (!req.sigoAuthHeaders) {
      res
        .status(401)
        .json({
          error: "No autenticado",
          message: "Faltan headers de autenticación de SIGO",
        });
      return;
    }

    const { serie, numero } = req.params;
    const motivo = (req.body && (req.body as any).motivo) || undefined;

    const invoiceService = getInvoiceService();
    const data = await invoiceService.createCreditNoteByInvoiceNumber(
      serie,
      numero,
      req.sigoAuthHeaders,
      motivo,
    );

    res
      .status(201)
      .json({
        success: true,
        message: "Nota de crédito creada para anulación",
        data,
      });
  } catch (error) {
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible anular la factura (nota de crédito)",
    });
  }
};
