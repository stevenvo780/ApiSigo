import { Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
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
    .withMessage("Fecha de emisión debe ser válida"),
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

export const createInvoice = async (
  req: InvoiceRequest,
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

    // Verificar que tenemos credenciales
    if (!req.sigoCredentials) {
      res.status(401).json({
        error: "Credenciales SIGO requeridas",
        message: "Middleware de credenciales no configurado correctamente",
      });
      return;
    }

    const invoiceData = req.body;
    const invoiceService = getInvoiceService();
    
    // El servicio maneja automáticamente headers pre-configurados o credenciales
    const result = await invoiceService.createInvoice(
      invoiceData,
      req.sigoCredentials,
      req.sigoAuthHeaders,
    );

    res.status(201).json({
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
        .json({ error: "Parámetros inválidos", details: errors.array() });
      return;
    }

    // Verificar que tenemos credenciales
    if (!req.sigoCredentials) {
      res.status(401).json({
        error: "Credenciales SIGO requeridas",
        message: "Middleware de credenciales no configurado correctamente",
      });
      return;
    }

    const { serie, numero } = req.params;
    const motivo = (req.body && (req.body as any).motivo) || undefined;

    const invoiceService = getInvoiceService();
    
    // El servicio maneja automáticamente headers pre-configurados o credenciales
    const data = await invoiceService.createCreditNoteByInvoiceNumber(
      serie,
      numero,
      req.sigoCredentials,
      motivo,
      req.sigoAuthHeaders,
    );

    res.status(201).json({
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
