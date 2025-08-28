import axios from "axios";
import config from "@/shared/config";
import { SigoCredentials } from "@/middleware/sigoCredentials";
import SigoAuthService from "@/services/sigoAuthService";

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

  private async ensureAuth(credentials?: SigoCredentials, authHeaders?: any) {
    // Si ya tenemos headers configurados, úsalos directamente
    if (authHeaders?.Authorization && authHeaders?.["Partner-Id"]) {
      this.client.defaults.headers["Authorization"] = authHeaders.Authorization;
      this.client.defaults.headers["Partner-Id"] = authHeaders["Partner-Id"];
      return;
    }

    // Si no hay headers pero sí credenciales, autenticar
    if (credentials) {
      await SigoAuthService.configureAxiosClient(this.client, credentials);
      return;
    }

    throw new Error("Se requieren credenciales o headers de autenticación");
  }

  async createClient(
    data: CreateClientData,
    credentials?: SigoCredentials,
    authHeaders?: any,
  ): Promise<any> {
    await this.ensureAuth(credentials, authHeaders);

    const sigoPayload = this.buildSiigoCustomerPayload(data);
    const response = await this.client.post("/v1/customers", sigoPayload);
    return response.data;
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
    // SIGO requiere formato específico:
    // - id_type: string (no objeto)
    // - name: array de exactamente 2 elementos [nombre, apellido]
    const nombreCompleto = data.razonSocial.trim();
    const palabras = nombreCompleto.split(" ");

    // Dividir en nombre y apellido (máximo 2 elementos)
    const nombre = palabras[0] || nombreCompleto;
    const apellido = palabras.slice(1).join(" ") || nombre;

    return {
      person_type: this.mapPersonType(data.tipoDocumento),
      id_type: this.mapTipoDocumentoToIdType(data.tipoDocumento).toString(), // SIGO espera string
      identification: data.numeroDocumento,
      name: [nombre, apellido], // SIGO requiere exactamente 2 elementos
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
              first_name: nombre,
              last_name: apellido,
              email: data.email,
              phone: data.telefono
                ? { indicative: "57", number: data.telefono }
                : undefined,
            },
          ]
        : undefined,
      active: data.activo !== undefined ? data.activo : true,
    };
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
