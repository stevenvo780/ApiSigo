import { Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import SigoAuthService from "@/services/sigoAuthService";

export interface SigoCredentials {
  email: string;
  apiKey: string;
}

export interface RequestWithSigoCredentials extends Request {
  sigoCredentials?: SigoCredentials;
  sigoAuthHeaders?: {
    Authorization: string;
    "Partner-Id": string;
  };
}

// Validaciones para facturas
export const invoiceValidations = [
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

// Validaciones para parámetros de facturas
export const invoiceParamsValidations = [
  param("serie").notEmpty().withMessage("Serie es requerida"),
  param("numero").notEmpty().withMessage("Número es requerido"),
];

// Validaciones para clientes
export const clientValidations = [
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
];

/**
 * Middleware unificado que maneja autenticación SIGO y validación
 */
export const createUnifiedAuthMiddleware = (validations: any[] = []) => {
  return [
    // Primero las validaciones
    ...validations,

    // Luego el middleware de autenticación
    async (
      req: RequestWithSigoCredentials,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        // 1. Verificar errores de validación
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          res.status(400).json({
            error: "Datos inválidos",
            details: errors.array(),
          });
          return;
        }

        // 2. Extraer credenciales SIGO
        const email = req.headers["x-sigo-email"] as string;
        const apiKey = req.headers["x-sigo-apikey"] as string;

        if (!email || !apiKey) {
          res.status(401).json({
            error: "Credenciales SIGO requeridas",
            message:
              "Debe proporcionar x-sigo-email y x-sigo-apikey en los headers",
            headers_required: {
              "x-sigo-email": "Email de usuario SIGO",
              "x-sigo-apikey": "API Key de SIGO",
            },
          });
          return;
        }

        // 3. Configurar credenciales en el request
        req.sigoCredentials = {
          email: email.trim(),
          apiKey: apiKey.trim(),
        };

        // 4. Obtener headers de autenticación
        const authHeaders = await SigoAuthService.getAuthHeaders(
          req.sigoCredentials,
        );

        // 5. Permitir override de Partner-Id si se especifica
        const partnerOverride = req.headers["x-sigo-partner-id"] as
          | string
          | undefined;
        req.sigoAuthHeaders = {
          ...authHeaders,
          ...(partnerOverride ? { "Partner-Id": partnerOverride.trim() } : {}),
        };

        // 6. Continuar con el siguiente middleware/controlador
        next();
      } catch (error) {
        res.status(401).json({
          error: "Error de autenticación SIGO",
          message: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    },
  ];
};

// Middlewares específicos preconfigurados
export const invoiceAuthMiddleware =
  createUnifiedAuthMiddleware(invoiceValidations);
export const invoiceParamsAuthMiddleware = createUnifiedAuthMiddleware(
  invoiceParamsValidations,
);
export const clientAuthMiddleware =
  createUnifiedAuthMiddleware(clientValidations);
export const basicAuthMiddleware = createUnifiedAuthMiddleware([]);
