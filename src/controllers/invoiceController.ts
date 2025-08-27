import { Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import { sigoService } from "@/services/sigoService";
import { CreateInvoiceData } from "@/services/sigoService";
import { InvoiceStatus } from "@/types";

// Validaciones para crear factura
export const validateInvoice = [
  body("serie").notEmpty().withMessage("Serie es requerida"),
  body("numero")
    .isInt({ min: 1 })
    .withMessage("Número debe ser un entero positivo"),
  body("fechaEmision")
    .isISO8601()
    .withMessage("Fecha de emisión debe ser válida"),
  body("cliente.ruc")
    .optional()
    .isLength({ min: 11, max: 11 })
    .withMessage("RUC del cliente debe tener 11 dígitos"),
  body("cliente.nit")
    .optional()
    .isLength({ min: 9, max: 15 })
    .withMessage("NIT del cliente debe ser válido"),
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
    .isFloat({ min: 0 })
    .withMessage("Total debe ser mayor a 0"),
];

// Validaciones para parámetros de factura
export const validateInvoiceParams = [
  param("serie").notEmpty().withMessage("Serie es requerida"),
  param("numero")
    .isInt({ min: 1 })
    .withMessage("Número debe ser un entero positivo"),
];

// Validaciones para estado de factura
export const validateStatus = [
  body("estado")
    .isIn(["PENDIENTE", "ENVIADO", "ACEPTADO", "RECHAZADO", "ANULADO"])
    .withMessage("Estado debe ser válido"),
];

// Validaciones para motivo de anulación
export const validateCancelReason = [
  body("motivo")
    .notEmpty()
    .withMessage("Motivo de anulación es requerido")
    .isLength({ min: 10, max: 500 })
    .withMessage("Motivo debe tener entre 10 y 500 caracteres"),
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

export interface StatusUpdateRequest extends InvoiceParamsRequest {
  body: {
    estado: InvoiceStatus;
  };
}

export interface CancelInvoiceRequest extends InvoiceParamsRequest {
  body: {
    motivo: string;
  };
}

/**
 * Crear factura
 */
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

/**
 * Obtener factura
 */
export const getInvoice = async (
  req: InvoiceParamsRequest,
  res: Response,
  next: NextFunction,
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
    const result = await sigoService.getInstance().getInvoice(serie, numero);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar estado de factura
 */
export const updateInvoiceStatus = async (
  req: StatusUpdateRequest,
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

    const { serie, numero } = req.params;
    const { estado } = req.body;
    const result = await sigoService
      .getInstance()
      .updateInvoiceStatus(serie, numero, estado);

    res.json({
      success: true,
      message: "Estado de factura actualizado exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enviar factura a SUNAT/DIAN
 */
export const sendInvoiceToSunat = async (
  req: InvoiceParamsRequest,
  res: Response,
  next: NextFunction,
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
    const result = await sigoService
      .getInstance()
      .sendInvoiceToSunat(serie, numero);

    res.json({
      success: true,
      message: "Factura enviada a SUNAT exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Anular factura
 */
export const cancelInvoice = async (
  req: CancelInvoiceRequest,
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

    const { serie, numero } = req.params;
    const { motivo } = req.body;
    const result = await sigoService
      .getInstance()
      .cancelInvoice(serie, numero, motivo);

    res.json({
      success: true,
      message: "Factura anulada exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener estado de factura
 */
export const getInvoiceStatus = async (
  req: InvoiceParamsRequest,
  res: Response,
  next: NextFunction,
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
    const result = await sigoService
      .getInstance()
      .getInvoiceStatus(serie, numero);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Health check de facturas
 */
export const healthCheck = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sigoHealth = await sigoService.getInstance().healthCheck();

    res.json({
      success: true,
      service: "Invoice Controller",
      timestamp: new Date().toISOString(),
      sigo: sigoHealth,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      service: "Invoice Controller",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Obtener lista de facturas (con paginación)
 */
export const getInvoices = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const serie = req.query.serie as string;
    const estado = req.query.estado as string;

    // Consulta paginada a SIGO
    res.json({
      success: true,
      data: {
        invoices: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0,
        },
        filters: {
          serie,
          estado,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reenviar factura
 */
export const resendInvoice = async (
  req: InvoiceParamsRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { serie, numero } = req.params;

    // Primero obtener la factura actual
    const invoice = await sigoService.getInstance().getInvoice(serie, numero);

    // Luego reenviarla a SUNAT
    const result = await sigoService
      .getInstance()
      .sendInvoiceToSunat(serie, numero);

    res.json({
      success: true,
      message: "Factura reenviada exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
