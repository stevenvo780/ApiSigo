import { Request, Response, NextFunction } from "express";
import SigoAuthService from "@/services/sigoAuthService";

export interface SigoCredentials {
  email: string;
  apiKey: string;
}

// Extender Request para incluir credenciales y headers de autenticación
export interface RequestWithSigoCredentials extends Request {
  sigoCredentials?: SigoCredentials;
  sigoAuthHeaders?: {
    Authorization: string;
    "Partner-Id": string;
  };
}

export const extractSigoCredentials = (
  req: RequestWithSigoCredentials,
  res: Response,
  next: NextFunction,
): void => {
  // Extraer credenciales de headers
  const email = req.headers["x-sigo-email"] as string;
  const apiKey = req.headers["x-sigo-apikey"] as string;

  // Validar que las credenciales estén presentes
  if (!email || !apiKey) {
    res.status(401).json({
      error: "Credenciales SIGO requeridas",
      message: "Debe proporcionar x-sigo-email y x-sigo-apikey en los headers",
      headers_required: {
        "x-sigo-email": "Email de usuario SIGO",
        "x-sigo-apikey": "API Key de SIGO",
      },
    });
    return;
  }

  // Inyectar credenciales en el request
  req.sigoCredentials = {
    email: email.trim(),
    apiKey: apiKey.trim(),
  };

  next();
};

/**
 * Middleware que además de extraer credenciales, obtiene y configura
 * los headers de autenticación (Bearer + Partner-Id) listos para usar
 */
export const extractSigoCredentialsWithAuth = async (
  req: RequestWithSigoCredentials,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Primero extraer credenciales
    const email = req.headers["x-sigo-email"] as string;
    const apiKey = req.headers["x-sigo-apikey"] as string;

    // Validar que las credenciales estén presentes
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

    // Inyectar credenciales en el request
    req.sigoCredentials = {
      email: email.trim(),
      apiKey: apiKey.trim(),
    };

    // Obtener headers de autenticación de SIGO
    const authHeaders = await SigoAuthService.getAuthHeaders(
      req.sigoCredentials,
    );
    req.sigoAuthHeaders = authHeaders;

    next();
  } catch (error) {
    res.status(401).json({
      error: "Error de autenticación SIGO",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

export default extractSigoCredentials;
