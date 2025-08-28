import dotenv from "dotenv";

dotenv.config();

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
    apiKey: process.env.SIGO_API_KEY || "",
    username: process.env.SIGO_USERNAME || "",
    timeout: parseInt(process.env.SIGO_TIMEOUT || "30000", 10),
    authTimeout: parseInt(process.env.SIGO_AUTH_TIMEOUT || "30000", 10),
    documentId: process.env.SIIGO_DOCUMENT_ID
      ? parseInt(process.env.SIIGO_DOCUMENT_ID, 10)
      : 1,
    taxId: process.env.SIIGO_TAX_ID
      ? parseInt(process.env.SIIGO_TAX_ID, 10)
      : undefined,
    paymentMethodId: process.env.SIIGO_PAYMENT_METHOD_ID
      ? parseInt(process.env.SIIGO_PAYMENT_METHOD_ID, 10)
      : undefined,
    creditNoteDocumentId: process.env.SIIGO_CREDIT_NOTE_DOCUMENT_ID
      ? parseInt(process.env.SIIGO_CREDIT_NOTE_DOCUMENT_ID, 10)
      : 2,
  },

  // Webhooks
  webhook: {
    secret: process.env.HUB_WEBHOOK_SECRET || "",
  },
} as const;

export default config;
