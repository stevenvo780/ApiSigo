import { Router } from "express";
import {
  createInvoice,
  getInvoice,
  updateInvoiceStatus,
  sendInvoiceToSunat,
  cancelInvoice,
  getInvoiceStatus,
  getInvoices,
  resendInvoice,
  healthCheck,
  validateInvoice,
  validateInvoiceParams,
  validateStatus,
  validateCancelReason,
} from "@/controllers/invoiceController";

const router = Router();

/**
 * @route   POST /api/invoices
 * @desc    Crear nueva factura
 * @access  Private
 */
router.post("/", validateInvoice, createInvoice);

/**
 * @route   GET /api/invoices
 * @desc    Obtener lista de facturas con paginación
 * @access  Private
 */
router.get("/", getInvoices);

/**
 * @route   GET /api/invoices/health
 * @desc    Health check del servicio de facturas
 * @access  Public
 */
router.get("/health", healthCheck);

/**
 * @route   GET /api/invoices/:serie/:numero
 * @desc    Obtener factura específica
 * @access  Private
 */
router.get("/:serie/:numero", validateInvoiceParams, getInvoice);

/**
 * @route   PUT /api/invoices/:serie/:numero/status
 * @desc    Actualizar estado de factura
 * @access  Private
 */
router.put(
  "/:serie/:numero/status",
  validateInvoiceParams,
  validateStatus,
  updateInvoiceStatus,
);

/**
 * @route   GET /api/invoices/:serie/:numero/status
 * @desc    Obtener estado actual de factura
 * @access  Private
 */
router.get("/:serie/:numero/status", validateInvoiceParams, getInvoiceStatus);

/**
 * @route   POST /api/invoices/:serie/:numero/send
 * @desc    Enviar factura a SUNAT/DIAN
 * @access  Private
 */
router.post("/:serie/:numero/send", validateInvoiceParams, sendInvoiceToSunat);

/**
 * @route   POST /api/invoices/:serie/:numero/resend
 * @desc    Reenviar factura a SUNAT/DIAN
 * @access  Private
 */
router.post("/:serie/:numero/resend", validateInvoiceParams, resendInvoice);

/**
 * @route   POST /api/invoices/:serie/:numero/cancel
 * @desc    Anular factura
 * @access  Private
 */
router.post(
  "/:serie/:numero/cancel",
  validateInvoiceParams,
  validateCancelReason,
  cancelInvoice,
);

export default router;
