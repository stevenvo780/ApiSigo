import { Router } from "express";
import {
  createInvoice,
  cancelInvoice,
  validateInvoice,
  validateInvoiceParams,
  validateWebhookInvoice,
  createInvoiceFromWebhook,
} from "./controller";

const router = Router();

// Healthcheck del router de invoices
router.get("/__health", (_req, res) => {
  res.json({ ok: true, scope: "invoices-router" });
});

// POST /api/invoices/webhook - Crear factura desde webhook
router.post("/webhook", validateWebhookInvoice, createInvoiceFromWebhook);

// POST /api/invoices - Crear factura (endpoint principal)
router.post("/", validateInvoice, createInvoice);

// POST /api/invoices/cancel/:serie/:numero - Cancelar factura mediante nota de crédito
router.post("/cancel/:serie/:numero", validateInvoiceParams, cancelInvoice);

export default router;
