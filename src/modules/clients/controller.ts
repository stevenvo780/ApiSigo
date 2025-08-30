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
    .isMobilePhone("es-CO")
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

    const sigoService = getClientService();

    const result = await sigoService.createClient(
      customerData,
      req.sigoAuthHeaders!,
    );

    res.status(201).json({
      success: true,
      message: "Cliente creado exitosamente en SIGO",
      data: result,
      eventType: eventType || "manual_creation",
    });
  } catch (error) {
    console.error("[ClientController] Error creando cliente:", error);

    if (
      error instanceof Error &&
      (error as any)?.response?.headers?.["siigoapi-error-code"] ===
        "already_exists"
    ) {
      res.status(409).json({
        success: false,
        error: "Cliente ya existe",
        message: "El cliente con este número de documento ya existe en SIGO",
        code: "CLIENT_ALREADY_EXISTS",
        details: {
          numeroDocumento: req.body.customerData?.numeroDocumento,
          suggestion:
            "Use un número de documento diferente o actualice el cliente existente",
        },
      });
      return;
    }

    if (error instanceof Error && (error as any)?.response?.status === 400) {
      const responseData = (error as any)?.response?.data;
      res.status(400).json({
        success: false,
        error: "Error de validación en SIGO",
        message: responseData?.message || "Los datos enviados no son válidos",
        details: responseData?.Errors || responseData,
      });
      return;
    }

    next(error);
  }
};
