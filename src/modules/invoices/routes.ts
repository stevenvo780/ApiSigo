import { Router } from "express";
import crypto from "crypto";
import {
  createInvoice,
  cancelInvoice,
  validateInvoice,
  validateInvoiceParams,
} from "./controller";
import { getInvoiceService } from "./service";
import { extractSigoCredentials } from "@/middleware/sigoCredentials";

const router = Router();

// Validar firma de webhook
const validateWebhookSignature = (payload: any, signature?: string) => {
  if (!signature) return { ok: false, message: "Firma de webhook requerida" };
  const secret = process.env.HUB_WEBHOOK_SECRET || "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  const provided = signature.replace("sha256=", "");
  return provided === expected
    ? { ok: true }
    : { ok: false, message: "Firma de webhook inválida" };
};

// POST /api/invoices - Crear factura
router.post("/", extractSigoCredentials, validateInvoice, createInvoice);

// POST /api/invoices/webhook - Crear factura desde webhook
router.post("/webhook", extractSigoCredentials, async (req, res) => {
  const signature = (req.headers["x-hub-signature"] as string) || "";
  const sigCheck = validateWebhookSignature(req.body, signature);
  if (!sigCheck.ok) {
    return res.status(401).json({ status: "error", message: sigCheck.message });
  }

  // Verificar credenciales
  if (!(req as any).sigoCredentials) {
    return res.status(401).json({
      status: "error",
      message: "Credenciales SIGO requeridas en headers",
    });
  }

  const errors: any[] = [];
  if (!req.body?.event_type) errors.push({ msg: "event_type requerido" });
  if (req.body?.event_type && req.body.event_type !== "pedido.pagado")
    errors.push({ msg: "Tipo de evento debe ser pedido.pagado" });
  if (!Array.isArray(req.body?.data?.items) || req.body.data.items.length === 0)
    errors.push({ msg: "Debe incluir al menos un item" });
  if (typeof req.body?.data?.amount !== "number" || req.body.data.amount <= 0)
    errors.push({ msg: "Monto debe ser mayor a 0" });

  if (errors.length) {
    return res
      .status(400)
      .json({ status: "error", message: "Datos inválidos", errors });
  }

  try {
    const invoiceService = getInvoiceService();
    const result = await invoiceService.createInvoiceFromWebhook(
      req.body.data,
      (req as any).sigoCredentials,
    );

    const response = {
      success: true,
      factura_id: result.id || result.numero_documento,
      numero_factura: result.number || result.numero_documento,
      estado: "CREADA",
      sigo_id: result.id,
      pdf_url: result.pdf_url,
      xml_url: result.xml_url,
    };

    return res.status(200).json({ status: "success", ...response });
  } catch (err: any) {
    return res
      .status(500)
      .json({ status: "error", message: err?.message || "Error interno" });
  }
});

// POST /api/invoices/:serie/:numero/cancel - Cancelar factura
router.post(
  "/:serie/:numero/cancel",
  extractSigoCredentials,
  validateInvoiceParams,
  cancelInvoice,
);

export default router;
