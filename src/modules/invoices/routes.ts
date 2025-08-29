import { Router } from "express";
import crypto from "crypto";
import { getInvoiceService } from "./service";
import { extractSigoCredentialsWithAuth } from "@/middleware/sigoCredentials";

const router = Router();

// Healthcheck del router de invoices
router.get("/__health", (_req, res) => {
  res.json({ ok: true, scope: "invoices-router" });
});

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

// POST /api/invoices/webhook - Crear factura desde webhook (debe ir antes de las rutas genéricas)
router.post("/webhook", extractSigoCredentialsWithAuth, async (req, res) => {
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
      (req as any).sigoAuthHeaders,
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

// POST /api/invoices - Crear factura (endpoint principal)
router.post("/", extractSigoCredentialsWithAuth, async (req, res) => {
  try {
    if (!req.body.serie) {
      return res.status(400).json({ error: "Serie es requerida" });
    }
    if (!req.body.cliente?.razonSocial) {
      return res
        .status(400)
        .json({ error: "Razón social del cliente es requerida" });
    }
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un item" });
    }

    const invoiceService = getInvoiceService();
    const result = await invoiceService.createInvoice(
      req.body,
      (req as any).sigoCredentials,
      (req as any).sigoAuthHeaders,
    );

    return res.status(201).json({
      success: true,
      message: "Factura creada exitosamente",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error creando factura",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
});

// POST /api/invoices/cancel/:serie/:numero - Cancelar factura mediante nota de crédito
router.post(
  "/cancel/:serie/:numero",
  extractSigoCredentialsWithAuth,
  async (req: any, res: any) => {
    try {
      const { serie, numero } = req.params;
      const motivo = req.body?.motivo || "Cancelación desde API";

      if (!(req as any).sigoCredentials) {
        return res.status(401).json({
          error: "Credenciales SIGO requeridas",
          message: "Middleware de credenciales no configurado correctamente",
        });
      }

      const invoiceService = getInvoiceService();
      const result = await invoiceService.createCreditNoteByInvoiceNumber(
        serie,
        numero,
        (req as any).sigoCredentials,
        motivo,
        (req as any).sigoAuthHeaders,
      );

      return res.status(201).json({
        success: true,
        message: "Nota de crédito creada para cancelación",
        data: result,
      });
    } catch (error) {
      return res.status(500).json({
        error: "Error cancelando factura",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  },
);

// NOTA: Ruta de cancelar temporalmente deshabilitada por conflicto de routing
// TODO: Implementar endpoint de cancelación con diferente patrón de URL

export default router;
