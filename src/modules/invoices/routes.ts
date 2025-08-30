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


router.get("/payment-types", getPaymentTypes);


router.post("/", validateInvoice, createInvoice);


router.post("/cancel/:serie/:numero", validateInvoiceParams, cancelInvoice);

export default router;
