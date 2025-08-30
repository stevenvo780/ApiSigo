import { Request, Response, NextFunction } from "express";
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

export const extractSigoCredentialsWithAuth = async (
  req: RequestWithSigoCredentials,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
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

    const signature = (req.headers["x-hub-signature"] as string) || "";
    if (!verifyWebhookSignature(signature)) {
      res.status(401).json({ error: "Firma de webhook inválida" });
      return;
    }

    req.sigoCredentials = {
      email: email.trim(),
      apiKey: apiKey.trim(),
    };

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

const verifyWebhookSignature = (signature?: string): boolean => {
  if (!signature) return false;
  const secret = process.env.HUB_WEBHOOK_SECRET || "";
  return signature === secret;
};

export default extractSigoCredentialsWithAuth;
