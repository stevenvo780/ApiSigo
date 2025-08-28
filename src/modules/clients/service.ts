import axios from "axios";
import config from "@/shared/config";
import AuthenticationCache from "@/shared/authCache";
import { defaultLogger as logger } from "@/utils/logger";
import { SigoCredentials } from "@/middleware/sigoCredentials";

export interface CreateClientData {
  tipoDocumento: "RUC" | "DNI" | "CE" | "NIT" | "CC";
  numeroDocumento: string;
  razonSocial: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  codigoPostal?: string;
  activo?: boolean;
}

export class ClientService {
  private client: any;

  constructor() {
    this.client = axios.create({
      baseURL: config.sigo.baseUrl,
      timeout: config.sigo.timeout,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  private async ensureAuth(credentials: SigoCredentials) {
    // Verificar si tenemos token en cache
    const cachedToken = AuthenticationCache.getToken(
      credentials.email,
      credentials.apiKey,
    );

    if (cachedToken) {
      this.client.defaults.headers["Authorization"] = `Bearer ${cachedToken}`;
      return;
    }

    // Autenticar y cachear el token
    await this.authenticate(credentials);
  }

  private async authenticate(credentials: SigoCredentials): Promise<void> {
    try {
      logger.info("Iniciando autenticación con SIGO para clientes");

      const authUrl = `${config.sigo.baseUrl}/auth`;
      const authData = {
        username: credentials.email,
        access_key: credentials.apiKey,
      };

      logger.info(`Obteniendo token de autenticación desde ${authUrl}`);

      const response = await axios.post<{ access_token: string }>(
        authUrl,
        authData,
        {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.data?.access_token) {
        throw new Error("No se recibió token de autenticación");
      }

      const token = response.data.access_token;

      // Guardar token en caché
      AuthenticationCache.setToken(
        credentials.email,
        credentials.apiKey,
        token,
      );

      // Configurar token en el cliente
      this.client.defaults.headers["Authorization"] = `Bearer ${token}`;

      logger.info("Token obtenido y guardado en caché exitosamente");
    } catch (error) {
      logger.error("Error en autenticación SIGO:", error);
      throw new Error(`Error de autenticación: ${error}`);
    }
  }

  private mapTipoDocumentoToIdType(tipo: string): number {
    const map: Record<string, number> = {
      NIT: 31,
      CC: 13,
      CE: 22,
      DNI: 13,
      RUC: 41,
    };
    return map[tipo] || 31;
  }

  private mapPersonType(tipo: string): "Company" | "Person" {
    return tipo === "NIT" || tipo === "RUC" ? "Company" : "Person";
  }

  private buildSiigoCustomerPayload(data: CreateClientData) {
    return {
      person_type: this.mapPersonType(data.tipoDocumento),
      id_type: this.mapTipoDocumentoToIdType(data.tipoDocumento),
      identification: data.numeroDocumento,
      name: data.razonSocial,
      commercial_name: data.razonSocial,
      address: data.direccion
        ? {
            address: data.direccion,
          }
        : undefined,
      phones: data.telefono
        ? [{ indicative: "57", number: data.telefono }]
        : undefined,
      contacts: data.email
        ? [
            {
              first_name: data.razonSocial,
              email: data.email,
              phone: data.telefono,
            },
          ]
        : undefined,
      active: data.activo !== undefined ? data.activo : true,
    };
  }

  async createClient(
    clientData: CreateClientData,
    credentials: SigoCredentials,
  ): Promise<any> {
    await this.ensureAuth(credentials);
    const payload = this.buildSiigoCustomerPayload(clientData);
    const response = await this.client.post("/v1/customers", payload);
    return response.data;
  }
}

// Singleton
let clientServiceInstance: ClientService | null = null;

export const getClientService = (): ClientService => {
  if (!clientServiceInstance) {
    clientServiceInstance = new ClientService();
  }
  return clientServiceInstance;
};

export default { getInstance: getClientService };
