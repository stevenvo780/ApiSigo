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

/**
 * Middleware único: extrae credenciales y prepara headers de autenticación
 * (Bearer + Partner-Id) listos para usar en cualquier endpoint.
 */
export const extractSigoCredentialsWithAuth = async (
  req: RequestWithSigoCredentials,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Extraer credenciales desde headers obligatorios
    const email = req.headers["x-email"] as string;
    const apiKey = req.headers["x-api-key"] as string;

    if (!email || !apiKey) {
      res.status(401).json({
        error: "Credenciales SIGO requeridas",
        message: "Debe proporcionar x-email y x-api-key en los headers",
        headers_required: {
          "x-email": "Email de usuario SIGO",
          "x-api-key": "API Key de SIGO",
        },
      });
      return;
    }

    // Inyectar credenciales en el request
    req.sigoCredentials = {
      email: email.trim(),
      apiKey: apiKey.trim(),
    };
    // Obtener headers de autenticación de SIGO (siempre desde token)
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

export default extractSigoCredentialsWithAuth;
