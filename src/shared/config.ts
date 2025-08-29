import dotenv from "dotenv";

// Cargar .env (override sólo en desarrollo para facilitar pruebas locales)
dotenv.config({ override: process.env.NODE_ENV !== "production" });

export const config = {
  // Server
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:3000",
  ],

  // SIGO API
  sigo: {
    baseUrl: process.env.SIGO_API_URL || "https://api.siigo.com",
    timeout: parseInt(process.env.SIGO_TIMEOUT || "30000", 10),
    authTimeout: parseInt(process.env.SIGO_AUTH_TIMEOUT || "30000", 10),
    documentId: parseInt(process.env.SIIGO_DOCUMENT_ID || "28418", 10), // Factura electrónica
    sellerId: process.env.SIIGO_SELLER_ID
      ? parseInt(process.env.SIIGO_SELLER_ID, 10)
      : 52,
    taxId: process.env.SIIGO_TAX_ID
      ? parseInt(process.env.SIIGO_TAX_ID, 10)
      : undefined,
    paymentMethodId: process.env.SIIGO_PAYMENT_METHOD_ID
      ? parseInt(process.env.SIIGO_PAYMENT_METHOD_ID, 10)
      : 452,
    creditNoteDocumentId: parseInt(
      process.env.SIIGO_CREDIT_NOTE_DOCUMENT_ID || "28420",
      10,
    ),
  },

  // Webhooks
  webhook: {
    secret: process.env.HUB_WEBHOOK_SECRET || "",
  },
} as const;

export default config;
