import { Request, Response, NextFunction } from "express";

export interface SigoCredentials {
  email: string;
  apiKey: string;
}

// Extender Request para incluir credenciales
export interface RequestWithSigoCredentials extends Request {
  sigoCredentials?: SigoCredentials;
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

export default extractSigoCredentials;
