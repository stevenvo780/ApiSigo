import { Router } from "express";
import crypto from "crypto";
import { facturaService } from "@/services/facturaService";
import webhookService from "@/services/webhookService";

const router = Router();

const validateSignature = (payload: any, signature?: string) => {
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

router.post("/", async (req, res) => {
  const signature = (req.headers["x-hub-signature"] as string) || "";
  const sigCheck = validateSignature(req.body, signature);
  if (!sigCheck.ok) {
    return res.status(401).json({ status: "error", message: sigCheck.message });
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
    const result: any = await facturaService.crearFacturaDesdeWebhook(
      req.body.data,
    );
    if (!result.success) {
      return res
        .status(400)
        .json({ status: "error", errores: result.errores || [] });
    }

    try {
      await webhookService.enviarFacturaCreada({
        factura_id: result.factura_id,
        documento_sigo_id: result.sigo_id || result.numero_factura,
        numero_documento: result.numero_factura,
        estado: result.estado,
        pdf_url: result.pdf_url,
        xml_url: result.xml_url,
        orden_graf: req.body.data?.order_id,
        monto_facturado: req.body.data?.amount
          ? req.body.data.amount / 100
          : undefined,
      });
    } catch {}

    return res.status(200).json({ status: "success", ...result });
  } catch (err: any) {
    return res
      .status(500)
      .json({ status: "error", message: err?.message || "Error interno" });
  }
});

router.get("/health", (_req, res) => {
  return res.json({
    status: "OK",
    service: "ApiSigo Webhooks",
    endpoints: {
      create: "/api/facturas",
      health: "/api/facturas/health",
    },
  });
});

export default router;
