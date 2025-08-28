import { Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import { sigoService } from "@/services/sigoService";
import { CreateClientData } from "@/services/sigoService";


export const validateClient = [
  body("tipoDocumento")
    .isIn(["RUC", "DNI", "CE", "NIT", "CC"])
    .withMessage("Tipo de documento debe ser válido"),
  body("numeroDocumento")
    .notEmpty()
    .withMessage("Número de documento es requerido"),
  body("razonSocial")
    .notEmpty()
    .withMessage("Razón social es requerida")
    .isLength({ min: 3, max: 100 })
    .withMessage("Razón social debe tener entre 3 y 100 caracteres"),
  body("email").optional().isEmail().withMessage("Email debe ser válido"),
  body("telefono")
    .optional()
    .isMobilePhone("es-PE")
    .withMessage("Teléfono debe ser válido"),
  body("direccion")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Dirección no debe exceder 200 caracteres"),
  body("ciudad")
    .optional()
    .isLength({ max: 50 })
    .withMessage("Ciudad no debe exceder 50 caracteres"),
  body("departamento")
    .optional()
    .isLength({ max: 50 })
    .withMessage("Departamento no debe exceder 50 caracteres"),
  body("codigoPostal")
    .optional()
    .isLength({ max: 10 })
    .withMessage("Código postal no debe exceder 10 caracteres"),
];


export const validateClientParams = [
  param("tipoDocumento")
    .isIn(["RUC", "DNI", "CE", "NIT", "CC"])
    .withMessage("Tipo de documento debe ser válido"),
  param("numeroDocumento")
    .notEmpty()
    .withMessage("Número de documento es requerido"),
];

export interface ClientRequest extends Request {
  body: CreateClientData;
}

export interface ClientParamsRequest extends Request {
  params: {
    tipoDocumento: string;
    numeroDocumento: string;
  };
}

export interface UpdateClientRequest extends ClientParamsRequest {
  body: Partial<CreateClientData>;
}

/**
 * Crear cliente
 */
export const createClient = async (
  req: Request, // Change type to Request to allow for custom body structure
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

    const { customerData, sigoCredentials } = req.body; // Extract new fields

    // Validate customerData if needed, or rely on sigoService validation
    if (!customerData) {
        res.status(400).json({ error: "customerData is required" });
        return;
    }

    const result = await sigoService.getInstance().createClient(customerData, sigoCredentials); // Pass credentials

    res.status(201).json({
      success: true,
      message: "Cliente creado exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener cliente
 */
export const getClient = async (
  req: ClientParamsRequest,
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

    const { tipoDocumento, numeroDocumento } = req.params;
    const result = await sigoService.getInstance().getClient(numeroDocumento);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar cliente
 */
export const updateClient = async (
  req: UpdateClientRequest,
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

    const { tipoDocumento, numeroDocumento } = req.params;
    const updateData = req.body;
    const result = await sigoService
      .getInstance()
      .updateClient(numeroDocumento, updateData);

    res.json({
      success: true,
      message: "Cliente actualizado exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar cliente
 */
export const deleteClient = async (
  req: ClientParamsRequest,
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

    const { tipoDocumento, numeroDocumento } = req.params;
    const result = await sigoService
      .getInstance()
      .deleteClient(numeroDocumento);

    res.json({
      success: true,
      message: "Cliente eliminado exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Buscar clientes
 */
export const searchClients = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const tipoDocumento = req.query.tipoDocumento as string;

    if (!query) {
      res.status(400).json({
        error: "Parámetro de búsqueda (q) es requerido",
      });
      return;
    }

    const result = await sigoService.getInstance().searchClients({
      query,
      page,
      limit,
      tipoDocumento,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener lista de clientes (con paginación)
 */
export const getClients = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const tipoDocumento = req.query.tipoDocumento as string;
    const activo = req.query.activo === "true";

    const result = await sigoService.getInstance().getClientList({
      page,
      limit,
      tipoDocumento,
      activo,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activar/Desactivar cliente
 */
export const toggleClientStatus = async (
  req: ClientParamsRequest,
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

    const { tipoDocumento, numeroDocumento } = req.params;
    const { activo } = req.body;

    const result = await sigoService
      .getInstance()
      .updateClient(numeroDocumento, { activo: activo } as any);

    res.json({
      success: true,
      message: `Cliente ${activo ? "activado" : "desactivado"} exitosamente`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Validar documento de cliente
 */
export const validateClientDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { tipoDocumento, numeroDocumento } = req.query;

    if (!tipoDocumento || !numeroDocumento) {
      res.status(400).json({
        error: "Tipo de documento y número de documento son requeridos",
      });
      return;
    }


    let isValid = false;
    let mensaje = "";

    switch (tipoDocumento) {
      case "RUC":
        isValid = /^\d{11}$/.test(numeroDocumento as string);
        mensaje = isValid ? "RUC válido" : "RUC debe tener 11 dígitos";
        break;
      case "DNI":
        isValid = /^\d{8}$/.test(numeroDocumento as string);
        mensaje = isValid ? "DNI válido" : "DNI debe tener 8 dígitos";
        break;
      case "CE":
        isValid = /^\d{9}$/.test(numeroDocumento as string);
        mensaje = isValid ? "CE válido" : "CE debe tener 9 dígitos";
        break;
      case "NIT":
        isValid = /^\d{9,15}$/.test(numeroDocumento as string);
        mensaje = isValid
          ? "NIT válido"
          : "NIT debe tener entre 9 y 15 dígitos";
        break;
      case "CC":
        isValid = /^\d{6,12}$/.test(numeroDocumento as string);
        mensaje = isValid ? "CC válida" : "CC debe tener entre 6 y 12 dígitos";
        break;
      default:
        mensaje = "Tipo de documento no válido";
    }

    res.json({
      success: true,
      data: {
        tipoDocumento,
        numeroDocumento,
        valido: isValid,
        mensaje,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Health check de clientes
 */
export const healthCheck = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sigoHealth = await sigoService.getInstance().healthCheck();

    res.json({
      success: true,
      service: "Client Controller",
      timestamp: new Date().toISOString(),
      sigo: sigoHealth,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      service: "Client Controller",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
