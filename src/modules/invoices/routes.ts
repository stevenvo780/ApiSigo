import { Router } from "express";
import {
  createInvoice,
  cancelInvoice,
  validateInvoice,
  validateInvoiceParams,
  getPaymentTypes,
} from "./controller";

const router = Router();

router.get("/__health", (_req, res) => {
  res.json({ ok: true, scope: "invoices-router" });
});

// GET /api/invoices/payment-types - Obtener métodos de pago disponibles
router.get("/payment-types", getPaymentTypes);

// POST /api/invoices - Crear factura (único endpoint)
router.post("/", validateInvoice, createInvoice);

// POST /api/invoices/cancel/:serie/:numero - Cancelar factura mediante nota de crédito
router.post("/cancel/:serie/:numero", validateInvoiceParams, cancelInvoice);

export default router;
