// Tipos para el webhook de orden pagada (estructura real de Graf/Hub Central)
export interface WebhookOrderData {
  order_id: number;
  store_id?: number;
  customer_id?: number;
  amount: number; // En centavos
  currency: string;
  items: Array<{
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number; // En centavos
    total: number; // En centavos
  }>;
  paid_at: string;
  customer_name?: string;
  customer_ruc?: string;
  shipping_address?: {
    address: string;
    city?: string;
    department?: string;
    country?: string;
  };
}

// Interfaces auxiliares simplificadas (compatibles con la estructura real)
export interface Customer {
  id?: number;
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
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number; // En centavos
  total: number; // En centavos
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
  total_iva: number;
  total_descuentos: number;
  total: number;
}

// Tipos para respuestas de servicios
export interface FacturaServiceResponse {
  success: boolean;
  data?: {
    factura_id: string;
    numero_factura: string;
    estado: string;
    pdf_url?: string;
    xml_url?: string;
  };
  error?: string;
  details?: any;
}

export interface SigoServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
  status_code?: number;
}

export interface WebhookServiceResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// Tipos adicionales necesarios para el proyecto
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

export type RequiredOrderFields = 'order_id' | 'amount' | 'items' | 'paid_at';

// Tipos para validación
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

// Tipos para configuración
export interface SigoConfig {
  baseUrl: string;
  apiKey: string;
  username?: string;
  password?: string;
  timeout: number;
  retries: number;
}

export interface WebhookConfig {
  secret: string;
  timeout: number;
  retries: number;
  backoff: {
    initial: number;
    multiplier: number;
    max: number;
  };
}

// Tipos para monitoreo
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    sigo: 'up' | 'down' | 'degraded';
    database: 'up' | 'down' | 'degraded';
    webhook: 'up' | 'down' | 'degraded';
  };
  response_time_ms: number;
}

// Tipos para logs
export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  service: string;
  metadata?: Record<string, any>;
}

// Estados de factura en SIGO
export type EstadoFactura = 
  | 'BORRADOR'
  | 'PENDIENTE'
  | 'ENVIADO_SUNAT'
  | 'ACEPTADO'
  | 'RECHAZADO'
  | 'ANULADO';

// Tipos de documento fiscal
export type TipoDocumento = 
  | 'FACTURA_VENTA'
  | 'BOLETA_VENTA'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO';

// Tipos de identificación de cliente
export type TipoIdentificacion = 
  | 'RUC'
  | 'DNI'
  | 'CE'
  | 'NIT'
  | 'CC'
  | 'PASAPORTE';

// Eventos de webhook
export type WebhookEvent = 
  | 'pedido.pagado'
  | 'pedido.cancelado'
  | 'factura.creada'
  | 'factura.enviada'
  | 'factura.anulada';

// Tipos para SIGO Service
export interface CreateInvoiceData {
  tipo_documento: string;
  serie: string;
  cliente: SigoClient;
  items: SigoInvoiceItem[];
  referencia_externa?: any;
}

export interface InvoiceStatus {
  estado: EstadoFactura;
  fecha_actualizacion: string;
  observaciones?: string;
}