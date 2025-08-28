import { Router } from "express";
import {
  createInvoice,
  cancelInvoice,
  validateInvoice,
  validateInvoiceParams,
} from "@/controllers/invoiceController";

const router = Router();

/**
 * @route   POST /api/invoices
 * @desc    Crear nueva factura
 * @access  Private
 */
router.post("/", validateInvoice, createInvoice);

/**
 * @route   POST /api/invoices/:serie/:numero/cancel
 * @desc    Anular factura (no soportado; devuelve mensaje)
 * @access  Private
 */
router.post("/:serie/:numero/cancel", validateInvoiceParams, cancelInvoice);

export default router;
