import { Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import sigoService from "@/services/sigoService";
import { CreateInvoiceData } from "@/services/sigoService";

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

export interface InvoiceRequest extends Request {
  body: CreateInvoiceData;
}

export interface InvoiceParamsRequest extends Request {
  params: {
    serie: string;
    numero: string;
  };
}

/** Crear factura */
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

    const invoiceData = req.body;
    const result = await sigoService.getInstance().createInvoice(invoiceData);

    res.status(201).json({
      success: true,
      message: "Factura creada exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/** Cancelar factura (placeholder, no soportado por Siigo) */
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

    const { serie, numero } = req.params;
    const motivo = (req.body && (req.body as any).motivo) || undefined;

    const data = await sigoService
      .getInstance()
      .createCreditNoteByInvoiceNumber(serie, numero, motivo);

    res.status(201).json({
      success: true,
      message: "Nota de crédito creada para anulación",
      data,
    });
  } catch (error) {
    // Si falla, devolver mensaje claro
    res.status(400).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No fue posible anular la factura (nota de crédito)",
    });
  }
};
