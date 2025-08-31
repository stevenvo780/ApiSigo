import "dotenv/config";
import express, { Express } from "express";
import cors from "cors"
import { routes as invoiceRoutes } from "@/modules/invoices";

import {
  errorHandler,
  notFound,
  requestLogger,
  validateJson,
} from "@/middleware/errorHandler";

import { extractSigoCredentialsWithAuth } from "@/middleware/sigoCredentials";

const app: Express = express();
const PORT = process.env.PORT || 8080;

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:8080",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "x-email",
      "x-api-key",
      "x-hub-signature",
      "Partner-Id",
    ],
  }),
);


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV !== "test") {
  app.use(requestLogger);
}

app.use("/api", extractSigoCredentialsWithAuth);

app.get("/api", (req, res) => {
  res.json({
    success: true,
    name: "SIGO POS API",
    description:
      "API para integración con SIGO POS - Facturación electrónica para Colombia",
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      invoices: "/api/invoices",
    },
    documentation: "/api/docs",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/invoices", invoiceRoutes);

app.get("/api/docs", (req, res) => {
  res.json({
    success: true,
    documentation: {
      invoices: {
        "POST /api/invoices": "Crear nueva factura",
        "POST /api/invoices/webhook": "Crear factura desde webhook",
        "POST /api/invoices/:serie/:numero/cancel":
          "Anular factura (crear nota de crédito)",
      },
    },
    schemas: {
      invoice: {
        serie: "string",
        numero: "number",
        fechaEmision: "string (ISO 8601)",
        cliente: {
          tipoDocumento: "RUC|NIT|CC|DNI|CE",
          numeroDocumento: "string",
          razonSocial: "string",
          email: "string (optional)",
          telefono: "string (optional)",
        },
        items: [
          {
            descripcion: "string",
            cantidad: "number",
            precioUnitario: "number",
          },
        ],
        totales: {
          subtotal: "number",
          impuestos: "number",
          total: "number",
        },
      },
    },
  });
});

app.use(notFound);

app.use(validateJson);

app.use(errorHandler);

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);

  process.exit(1);
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);

  process.exit(1);
});

const server = app.listen(PORT, () => {
  console.info(`
🚀 SIGO API Server iniciado
📍 Puerto: ${PORT}
🌍 Entorno: ${process.env.NODE_ENV || "development"}
🔗 URL: http://localhost:${PORT}
📚 Docs: http://localhost:${PORT}/api/docs
    `);
});

process.on("SIGTERM", () => {
  console.info("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.info("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  console.info("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.info("HTTP server closed");
  });
});

export default app;

module.exports = app;
