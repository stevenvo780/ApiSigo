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
    console.log("[Middleware] Starting auth process...");
    // Extraer credenciales usando formato estándar (con fallback a credenciales por defecto)
    const email =
      (req.headers["x-email"] as string) || "hola.salinero@salinero.co";
    const apiKey =
      (req.headers["x-api-key"] as string) ||
      "MWY0MTRkZjgtNWIzMi00ZmRhLWJkYmUtNmI2Y2VhYmM1OTI3Om4xfi1OWmc9NEc=";

    if (!email || !apiKey) {
      console.log("[Middleware] Missing credentials");
      res.status(401).json({
        error: "Credenciales SIGO requeridas",
        message:
          "Debe proporcionar x-email y x-api-key en los headers o usar credenciales por defecto",
        headers_required: {
          "x-email":
            "Email de usuario SIGO (default: hola.salinero@salinero.co)",
          "x-api-key": "API Key de SIGO (default: configurada)",
        },
      });
      return;
    }

    // Inyectar credenciales en el request
    req.sigoCredentials = {
      email: email.trim(),
      apiKey: apiKey.trim(),
    };
    console.log("[Middleware] Credentials set, getting auth headers...");

    // Obtener headers de autenticación de SIGO (siempre desde token)
    const authHeaders = await SigoAuthService.getAuthHeaders(req.sigoCredentials);
    console.log("[Middleware] Auth headers obtained");

    req.sigoAuthHeaders = authHeaders;

    console.log("[Middleware] Auth complete, calling next()");
    next();
  } catch (error) {
    console.error("[Middleware] Error:", error);
    res.status(401).json({
      error: "Error de autenticación SIGO",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
};

export default extractSigoCredentialsWithAuth;
