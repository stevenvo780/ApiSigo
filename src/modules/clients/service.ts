import axios from "axios";
import config from "@/shared/config";
import type { SigoAuthHeaders } from "@/services/sigoAuthService";

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

  async createClient(
    data: CreateClientData,
    authHeaders: SigoAuthHeaders,
  ): Promise<any> {
    const sigoPayload = this.buildSiigoCustomerPayload(data);
    const response = await this.client.post("/v1/customers", sigoPayload, {
      headers: authHeaders,
    });
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
    // - type: "Customer" (obligatorio)
    // - person_type: "Person" o "Company"
    // - id_type: string (código de tipo de documento)
    // - name: array de exactamente 2 elementos [nombre, apellido/razón social]
    // - fiscal_responsibilities: array obligatorio
    const nombreCompleto = data.razonSocial.trim();
    const isCompany = this.mapPersonType(data.tipoDocumento) === "Company";
    const palabras = nombreCompleto.split(" ");

    // Para compañías, usar dos tokens claros (evitar números u otros símbolos)
    const sanitize = (s: string) =>
      s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "").toUpperCase();
    const nombre = isCompany
      ? sanitize(palabras[0] || nombreCompleto) || "EMPRESA"
      : palabras[0] || nombreCompleto;
    const apellido = isCompany
      ? sanitize(palabras[1] || "SOCIEDAD") || "SOCIEDAD"
      : palabras.slice(1).join(" ") || nombre;

    return {
      type: "Customer", // OBLIGATORIO en SIGO
      person_type: this.mapPersonType(data.tipoDocumento),
      id_type: this.mapTipoDocumentoToIdType(data.tipoDocumento).toString(),
      identification: data.numeroDocumento,
      name: [nombre, apellido], // SIGO requiere exactamente 2 elementos
      commercial_name: data.razonSocial,
      active: data.activo !== undefined ? data.activo : true,
      vat_responsible: false, // Para simplificar, siempre false inicialmente
      fiscal_responsibilities: [{ code: "R-99-PN" }], // OBLIGATORIO: responsabilidad fiscal por defecto
      address: data.direccion
        ? {
            // SIGO espera 'address' y opcionalmente 'city' como objeto con código.
            // Si no tenemos un código válido, enviamos solo la dirección para evitar errores de tipo.
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
