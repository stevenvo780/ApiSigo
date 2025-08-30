import { Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";

import { getInvoiceService, CreateInvoiceData } from "./service";
import { RequestWithSigoCredentials } from "@/middleware/sigoCredentials";

export const validateInvoice = [
  body("date")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("Fecha debe estar en formato YYYY-MM-DD"),
  body("customer.identification")
    .notEmpty()
    .withMessage("Identificación del cliente es requerida"),
  body("customer.branch_office")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Sucursal debe ser un número entero mayor o igual a 0"),
  body("items")
    .isArray({ min: 1 })
    .withMessage("Debe incluir al menos un item"),
  body("items.*.code").notEmpty().withMessage("Código del item es requerido"),
  body("items.*.description")
    .notEmpty()
    .withMessage("Descripción del item es requerida"),
  body("items.*.quantity")
    .isFloat({ min: 0.01 })
    .withMessage("Cantidad debe ser mayor a 0"),
  body("items.*.price")
    .isFloat({ min: 0 })
    .withMessage("Precio debe ser mayor o igual a 0"),
  body("payments")
    .optional()
    .isArray()
    .withMessage("Los pagos deben ser un array si se proporcionan"),
  body("payments.*.id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("ID del método de pago debe ser un entero positivo"),
  body("payments.*.value")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Valor del pago debe ser mayor a 0"),
  body("payments.*.due_date")
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("Fecha de vencimiento debe estar en formato YYYY-MM-DD"),
  body("observations")
    .optional()
    .isLength({ max: 500 })
    .withMessage("Las observaciones no deben exceder 500 caracteres"),
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

    const invoiceService = getInvoiceService();
    const result = await invoiceService.createInvoice(
      req.body,
      req.sigoAuthHeaders!,
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

export const getPaymentTypes = async (
  req: RequestWithSigoCredentials,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const invoiceService = getInvoiceService();
    const documentType = (req.query.document_type as string) || "FV";

    const paymentTypes = await invoiceService.getPaymentTypes(
      req.sigoAuthHeaders!,
      documentType,
    );

    res.status(200).json({
      success: true,
      data: paymentTypes,
      message: `Métodos de pago disponibles para documento tipo ${documentType}`,
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
      res.status(400).json({
        error: "Parámetros inválidos",
        details: errors.array(),
      });
      return;
    }

    const { serie, numero } = req.params;
    const motivo = (req.body && (req.body as any).motivo) || undefined;

    const invoiceService = getInvoiceService();
    const data = await invoiceService.createCreditNoteByInvoiceNumber(
      serie,
      numero,
      req.sigoAuthHeaders!,
      motivo,
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
