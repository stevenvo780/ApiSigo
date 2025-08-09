// Tipos para los webhooks del Hub Central
export interface WebhookOrderData {
  id: string;
  numero: string;
  total: number;
  subtotal: number;
  impuestos: number;
  moneda: string;
  fechaCreacion: string;
  estado: string;
  customer: Customer;
  items: OrderItem[];
  descuentos: Discount[];
  metadatos?: Record<string, any>;
}

export interface Customer {
  id: string;
  tipoDocumento: 'RUC' | 'DNI' | 'CE' | 'NIT' | 'CC';
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
  id: string;
  nombre: string;
  descripcion?: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  impuestos: number;
  total: number;
  sku?: string;
}

export interface Discount {
  tipo: 'porcentaje' | 'monto_fijo';
  valor: number;
  descripcion?: string;
}

// Tipos para datos transformados a SIGO
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
  total: number;
}

// Tipos para respuestas de SIGO API
export interface SigoApiResponse {
  id?: string;
  documentoId?: string;
  numero_documento?: string;
  estado?: string;
  pdfUrl?: string;
  pdf_url?: string;
  xmlUrl?: string;
  xml_url?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

// Tipos para respuestas de nuestra API
// Respuesta del servicio de facturas
export interface FacturaServiceResponse {
  success: boolean;
  factura_id: string;
  sigo_id?: string;
  serie: string;
  numero: string;
  estado: string;
  mensaje?: string;
  datos_transformados?: SigoInvoiceData;
  errores?: string[];
}

// Tipos para webhooks enviados al Hub Central
export interface WebhookFacturaCreada {
  event_type: 'factura.creada';
  source: 'apisigo';
  timestamp: string;
  data: {
    factura_id: string;
    order_id: number;
    documento_sigo_id: string;
    estado: string;
    monto: number;
    pdf_url: string;
    created_at: string;
  };
}

// Tipos para cálculos de impuestos
export interface TaxCalculation {
  valorSinIVA: number;
  iva: number;
  total?: number;
}

// Tipos para configuración
export interface SigoConfig {
  baseURL: string;
  apiKey: string;
  username?: string;
  password?: string;
  ivaRate: number;
  defaultCurrency: string;
  defaultSerie: string;
  timeout: number;
}

// Tipos para errores personalizados
export interface SigoApiErrorData {
  message: string;
  statusCode?: number;
  originalError?: Error;
  endpoint?: string;
  requestData?: any;
}

export interface ValidationErrorData {
  message: string;
  field: string;
  value?: any;
}

// Tipos para el sistema de webhooks
export interface WebhookConfig {
  hubCentralUrl: string;
  webhookSecret: string;
  maxRetries: number;
  retryDelay: number;
}

export interface WebhookPayload {
  event_type: string;
  source: string;
  timestamp: string;
  data: any;
}

// Tipos para testing
export interface MockOrderData extends WebhookOrderData {
  // Propiedades adicionales para testing
}

export interface MockSigoResponse extends SigoApiResponse {
  // Propiedades adicionales para testing
}

// Tipos para validaciones
export type RequiredOrderFields = 'order_id' | 'amount' | 'items' | 'paid_at';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrorData[];
}

// Tipos para el estado de las facturas
export type FacturaStatus = 
  | 'pendiente'
  | 'generada'
  | 'enviada'
  | 'aceptada'
  | 'rechazada'
  | 'anulada';

export type InvoiceStatus = 
  | 'PENDIENTE'
  | 'ENVIADO'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'ANULADO';

// Tipos para endpoints de la API
export interface ApiEndpoints {
  auth: string;
  clients: string;
  invoices: string;
  webhooks?: string;
}

// Tipos para health checks
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    sigo: boolean;
    database?: boolean;
    hubCentral?: boolean;
  };
  errors?: string[];
}

export interface ServiceHealthCheck {
  service: string;
  status: 'up' | 'down';
  responseTime?: number;
  lastCheck: string;
  error?: string;
}
