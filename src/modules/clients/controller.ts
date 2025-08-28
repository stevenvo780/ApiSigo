import { Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { getClientService, CreateClientData } from "./service";
import { RequestWithSigoCredentials } from "@/middleware/sigoCredentials";

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
];

export interface ClientRequestWithCredentials
  extends RequestWithSigoCredentials {
  body: {
    customerData: CreateClientData;
    eventType?: string;
  };
}

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

    // Verificar que tenemos credenciales
    if (!req.sigoCredentials) {
      res.status(401).json({
        error: "Credenciales SIGO requeridas",
        message: "Middleware de credenciales no configurado correctamente",
      });
      return;
    }

    const { customerData, eventType } = req.body;

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
        },
      });
      return;
    }

    if (eventType) {
      console.log(`[ClientController] Processing webhook event: ${eventType}`);
    }

    const sigoService = getClientService();
    
    // El servicio maneja automáticamente headers pre-configurados o credenciales
    const result = await sigoService.createClient(
      customerData,
      req.sigoCredentials,
      req.sigoAuthHeaders,
    );

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
