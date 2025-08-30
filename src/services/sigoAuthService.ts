import axios from "axios";
import config from "@/shared/config";
import AuthenticationCache from "@/shared/authCache";
import { defaultLogger as logger } from "@/utils/logger";
import { SigoCredentials } from "@/middleware/sigoCredentials";

interface SigoAuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface SigoAuthHeaders {
  Authorization: string;
  "Partner-Id": string;
}

export class SigoAuthService {
  /**
   * Normaliza la access key de Siigo:
   * - Si viene como "uuid:secret" => la convierte a base64
   * - Si parece base64 y al decodificar contiene ":" => la deja tal cual
   * - En otros casos, devuelve el valor original (fallback)
   */
  private static normalizeAccessKey(input: string): string {
    const t = (input || "").trim();
    if (!t) return t;

    if (t.includes(":")) {
      try {
        return Buffer.from(t, "utf8").toString("base64");
      } catch {
        return t;
      }
    }

    try {
      const decoded = Buffer.from(t, "base64").toString("utf8");
      if (decoded.includes(":")) {
        return t;
      }
    } catch {}

    return t;
  }

  /**
   * Extrae el Partner-Id del JWT token
   */
  public static extractPartnerIdFromToken(token: string): string | null {
    try {
      const part = token.split(".")[1];
      if (!part) return null;
      const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "===".slice((base64.length + 3) % 4);
      const json = Buffer.from(padded, "base64").toString("utf8");
      const payload = JSON.parse(json);
      return payload.api_subscription_key || null;
    } catch (error) {
      logger.error("Error extrayendo Partner-Id del token:", error);
      return null;
    }
  }

  /**
   * Obtiene token de autenticación desde SIGO
   */
  public static async authenticate(
    credentials: SigoCredentials,
  ): Promise<string> {
    try {
      logger.info("Iniciando autenticación con SIGO");

      const authUrl = `${config.sigo.baseUrl}/auth/user-login`;
      const accessKey = this.normalizeAccessKey(credentials.apiKey);
      const authData = {
        username: credentials.email,
        access_key: accessKey,
      };

      logger.info(`Obteniendo token de autenticación desde ${authUrl}`);

      const response = await axios.post<SigoAuthResponse>(authUrl, authData, {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.data?.access_token) {
        throw new Error("No se recibió token de autenticación");
      }

      const token = response.data.access_token;

      AuthenticationCache.setToken(
        credentials.email,
        credentials.apiKey,
        token,
      );

      logger.info("Token obtenido y guardado en caché exitosamente");
      return token;
    } catch (error) {
      logger.error("Error en autenticación SIGO:", error);
      throw new Error(`Error de autenticación: ${error}`);
    }
  }

  /**
   * Obtiene headers de autenticación (Bearer + Partner-Id) para SIGO
   */
  public static async getAuthHeaders(
    credentials: SigoCredentials,
  ): Promise<SigoAuthHeaders> {
    let token = AuthenticationCache.getToken(
      credentials.email,
      credentials.apiKey,
    );

    if (!token) {
      token = await this.authenticate(credentials);
    }

    const partnerId = this.extractPartnerIdFromToken(token);
    if (!partnerId) {
      throw new Error("No se pudo extraer Partner-Id del token");
    }

    return {
      Authorization: `Bearer ${token}`,
      "Partner-Id": partnerId,
    };
  }
}

export default SigoAuthService;
