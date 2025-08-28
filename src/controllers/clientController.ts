import { Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import { sigoService } from "@/services/sigoService";
import { CreateClientData } from "@/services/sigoService";

export const validateClient = [
  body("customerData.tipoDocumento")
    .isIn(["RUC", "DNI", "CE", "NIT", "CC"])
    .withMessage("Tipo de documento debe ser válido"),
  body("customerData.numeroDocumento")
    .notEmpty()
    .withMessage("Número de documento es requerido"),
  body("customerData.razonSocial")
    .notEmpty()
    .withMessage("Razón social es requerida")
    .isLength({ min: 3, max: 100 })
    .withMessage("Razón social debe tener entre 3 y 100 caracteres"),
  body("customerData.email")
    .optional()
    .isEmail()
    .withMessage("Email debe ser válido"),
  body("customerData.telefono")
    .optional()
    .isMobilePhone("es-PE")
    .withMessage("Teléfono debe ser válido"),
  body("customerData.direccion")
    .optional()
    .isLength({ max: 200 })
    .withMessage("Dirección no debe exceder 200 caracteres"),
  body("customerData.ciudad")
    .optional()
    .isLength({ max: 50 })
    .withMessage("Ciudad no debe exceder 50 caracteres"),
  body("customerData.departamento")
    .optional()
    .isLength({ max: 50 })
    .withMessage("Departamento no debe exceder 50 caracteres"),
  body("customerData.codigoPostal")
    .optional()
    .isLength({ max: 10 })
    .withMessage("Código postal no debe exceder 10 caracteres"),
  body("sigoCredentials")
    .optional()
    .isObject()
    .withMessage("Credenciales de SIGO deben ser un objeto"),
];

export const validateClientParams = [
  param("numeroDocumento")
    .notEmpty()
    .withMessage("Número de documento es requerido"),
];

// Extended request interfaces to include credentials
export interface ClientRequestWithCredentials extends Request {
  body: {
    customerData: CreateClientData;
    sigoCredentials?: any;
    eventType?: string;
  };
}

export interface ClientParamsRequest extends Request {
  params: {
    numeroDocumento: string;
  };
  body: {
    sigoCredentials?: any;
  };
}

export interface UpdateClientRequest extends Request {
  params: {
    numeroDocumento: string;
  };
  body: {
    customerData?: Partial<CreateClientData>;
    sigoCredentials?: any;
    activo?: boolean;
  };
}

/**
 * Crear cliente - Compatible con webhook desde HubCentral
 */
export const createClient = async (
  req: ClientRequestWithCredentials,
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

    const { customerData, sigoCredentials, eventType } = req.body;

    if (!customerData) {
      res.status(400).json({
        error: "customerData es requerido",
        expected: {
          customerData: {
            tipoDocumento: "RUC|DNI|CE|NIT|CC",
            numeroDocumento: "string",
            razonSocial: "string",
            email: "string (opcional)",
            telefono: "string (opcional)",
            direccion: "string (opcional)",
          },
          sigoCredentials: "object (opcional)",
        },
      });
      return;
    }

    if (eventType) {
      console.log(`[ClientController] Processing webhook event: ${eventType}`);
    }

    const result = await sigoService
      .getInstance()
      .createClient(customerData, sigoCredentials);

    res.status(201).json({
      success: true,
      message: "Cliente creado exitosamente en SIGO",
      data: result,
      eventType: eventType || "manual_creation",
    });
  } catch (error) {
    console.error("[ClientController] Error creando cliente:", error);
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

    const { numeroDocumento } = req.params;
    const { sigoCredentials } = req.body || {};

    const result = await sigoService
      .getInstance()
      .getClient(numeroDocumento, sigoCredentials);

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

    const { numeroDocumento } = req.params;
    const { customerData, sigoCredentials } = req.body;

    if (!customerData) {
      res.status(400).json({
        error: "customerData es requerido para actualización",
      });
      return;
    }

    const result = await sigoService
      .getInstance()
      .updateClient(numeroDocumento, customerData, sigoCredentials);

    res.json({
      success: true,
      message: "Cliente actualizado exitosamente en SIGO",
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

    const { numeroDocumento } = req.params;
    const { sigoCredentials } = req.body || {};

    const result = await sigoService
      .getInstance()
      .deleteClient(numeroDocumento, sigoCredentials);

    res.json({
      success: true,
      message: "Cliente eliminado exitosamente de SIGO",
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
    const { sigoCredentials } = req.body || {};

    if (!query) {
      res.status(400).json({
        error: "Parámetro de búsqueda (q) es requerido",
      });
      return;
    }

    const searchParams = {
      query,
      page,
      limit,
      ...(tipoDocumento && { tipoDocumento }),
    };

    const result = await sigoService
      .getInstance()
      .searchClients(searchParams, sigoCredentials);

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
    const { sigoCredentials } = req.body || {};

    const listParams = {
      page,
      limit,
      ...(tipoDocumento && { tipoDocumento }),
      ...(req.query.activo !== undefined && { activo }),
    };

    const result = await sigoService
      .getInstance()
      .getClientList(listParams, sigoCredentials);

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
  req: UpdateClientRequest,
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

    const { numeroDocumento } = req.params;
    const { activo, sigoCredentials } = req.body;

    if (typeof activo !== "boolean") {
      res.status(400).json({
        error: "El campo 'activo' debe ser un booleano (true/false)",
      });
      return;
    }

    const result = await sigoService
      .getInstance()
      .updateClient(
        numeroDocumento,
        { activo } as Partial<CreateClientData>,
        sigoCredentials,
      );

    res.json({
      success: true,
      message: `Cliente ${activo ? "activado" : "desactivado"} exitosamente en SIGO`,
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
    const tipoDocumento = req.query.tipoDocumento as string;
    const numeroDocumento = req.query.numeroDocumento as string;

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
        isValid = /^\d{11}$/.test(numeroDocumento);
        mensaje = isValid ? "RUC válido" : "RUC debe tener 11 dígitos";
        break;
      case "DNI":
        isValid = /^\d{8}$/.test(numeroDocumento);
        mensaje = isValid ? "DNI válido" : "DNI debe tener 8 dígitos";
        break;
      case "CE":
        isValid = /^\d{9}$/.test(numeroDocumento);
        mensaje = isValid ? "CE válido" : "CE debe tener 9 dígitos";
        break;
      case "NIT":
        isValid = /^\d{9,15}$/.test(numeroDocumento);
        mensaje = isValid
          ? "NIT válido"
          : "NIT debe tener entre 9 y 15 dígitos";
        break;
      case "CC":
        isValid = /^\d{6,12}$/.test(numeroDocumento);
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
      version: "1.0.0",
      endpoints: {
        create: "POST /api/clients",
        get: "GET /api/clients/:numeroDocumento",
        update: "PUT /api/clients/:numeroDocumento",
        delete: "DELETE /api/clients/:numeroDocumento",
        search: "GET /api/clients/search?q=query",
        list: "GET /api/clients",
        toggle: "PATCH /api/clients/:numeroDocumento/status",
        validate:
          "GET /api/clients/validate?tipoDocumento=XXX&numeroDocumento=YYY",
      },
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
