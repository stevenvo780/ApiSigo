export interface Customer {
  id?: number;
  tipoDocumento: "RUC" | "DNI" | "CE" | "NIT" | "CC";
  numeroDocumento: string;
  nombres: string;
  apellidos?: string;
  razonSocial?: string;
  email?: string;
  telefono?: string;
  direccion?: Address;
}

export interface Address {
  direccion: string;
  ciudad?: string;
  departamento?: string;
  codigoPostal?: string;
  pais?: string;
}

export interface OrderItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Discount {
  tipo: "porcentaje" | "monto_fijo";
  valor: number;
  descripcion?: string;
}

export interface SigoInvoiceData {
  tipo_documento: string;
  serie: string;
  numero_correlativo: number;
  fecha_emision: string;
  hora_emision: string;
  cliente: SigoClient;
  moneda: string;
  items: SigoInvoiceItem[];
  resumen: SigoInvoiceSummary;
  referencia_externa: {
    orden_graf: number;
    tienda_graf: number;
    pagado_en: string;
  };
}

export interface SigoClient {
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  direccion?: string;
  email?: string;
  telefono?: string;
}

export interface SigoInvoiceItem {
  codigo_producto: string;
  descripcion: string;
  cantidad: number;
  unidad_medida: string;
  valor_unitario: number;
  precio_unitario: number;
  valor_total: number;
  iva_total: number;
  precio_total: number;
}

export interface SigoInvoiceSummary {
  subtotal: number;
  iva: number;
  total_iva: number;
  total_descuentos: number;
  total: number;
}

export interface FacturaServiceResponse {
  success: boolean;
  // contrato alternativo usado por tests
  factura_id?: string;
  numero_factura?: string;
  estado?: string;
  pdf_url?: string;
  xml_url?: string;
  serie?: string;
  numero?: string;
  mensaje?: string;
  datos_transformados?: any;
  data?: {
    factura_id: string;
    numero_factura: string;
    estado: string;
    pdf_url?: string;
    xml_url?: string;
  };
  error?: string;
  errores?: string[];
  details?: any;
}

export interface SigoServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
  status_code?: number;
}

export interface SigoApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status_code?: number;
  numero_documento?: string;
  pdfUrl?: string;
  pdf_url?: string;
  xmlUrl?: string;
  xml_url?: string;
}

export interface TaxCalculation {
  subtotal: number;
  iva: number;
  total: number;
  rate: number;
}

export interface ValidationErrorData {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrorData[];
  warnings?: string[];
}

export type RequiredOrderFields = "order_id" | "amount" | "items" | "paid_at";

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: any;
}

export interface SigoConfig {
  baseUrl: string;
  baseURL?: string;
  apiKey: string;
  username?: string;
  password?: string;
  timeout: number;
  retries: number;
  ivaRate?: number;
  defaultCurrency?: string;
  defaultSerie?: string;
}

export type EstadoFactura =
  | "BORRADOR"
  | "PENDIENTE"
  | "ENVIADO_SUNAT"
  | "ACEPTADO"
  | "RECHAZADO"
  | "ANULADO";

export type TipoDocumento =
  | "FACTURA_VENTA"
  | "BOLETA_VENTA"
  | "NOTA_CREDITO"
  | "NOTA_DEBITO";

export type TipoIdentificacion =
  | "RUC"
  | "DNI"
  | "CE"
  | "NIT"
  | "CC"
  | "PASAPORTE";
