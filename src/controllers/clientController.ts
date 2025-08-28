import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
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

// Request interface para creación con credenciales opcionales
export interface ClientRequestWithCredentials extends Request {
  body: {
    customerData: CreateClientData;
    sigoCredentials?: any;
    eventType?: string;
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
