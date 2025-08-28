import { Router } from "express";
import {
  createClient,
  getClient,
  updateClient,
  deleteClient,
  searchClients,
  getClients,
  toggleClientStatus,
  validateClientDocument,
  healthCheck,
  validateClient,
  validateClientParams,
} from "@/controllers/clientController";
import { authenticateWebhook } from "@/middleware/auth";

const router = Router();

/**
 * @route   GET /api/clients/health
 * @desc    Health check del servicio de clientes
 * @access  Public
 */
router.get("/health", healthCheck);

/**
 * @route   GET /api/clients/validate
 * @desc    Validar documento de cliente
 * @access  Public
 */
router.get("/validate", validateClientDocument);

/**
 * @route   GET /api/clients/search
 * @desc    Buscar clientes por término
 * @access  Private
 */
router.get("/search", searchClients);

/**
 * @route   GET /api/clients
 * @desc    Obtener lista de clientes con paginación
 * @access  Private
 */
router.get("/", getClients);

/**
 * @route   POST /api/clients
 * @desc    Crear nuevo cliente
 * @access  Private
 */
router.post("/", authenticateWebhook, validateClient, createClient);

/**
 * @route   GET /api/clients/:numeroDocumento
 * @desc    Obtener cliente específico
 * @access  Private
 */
router.get("/:numeroDocumento", validateClientParams, getClient);

/**
 * @route   PUT /api/clients/:numeroDocumento
 * @desc    Actualizar cliente
 * @access  Private
 */
router.put("/:numeroDocumento", validateClientParams, updateClient);

/**
 * @route   DELETE /api/clients/:numeroDocumento
 * @desc    Eliminar cliente
 * @access  Private
 */
router.delete("/:numeroDocumento", validateClientParams, deleteClient);

/**
 * @route   PATCH /api/clients/:numeroDocumento/status
 * @desc    Activar/Desactivar cliente
 * @access  Private
 */
router.patch("/:numeroDocumento/status", validateClientParams, toggleClientStatus);

export default router;
 * @route   PATCH /api/clients/:tipoDocumento/:numeroDocumento/toggle-status
 * @desc    Activar/Desactivar cliente
 * @access  Private
 */
router.patch(
  "/:tipoDocumento/:numeroDocumento/toggle-status",
  validateClientParams,
  toggleClientStatus,
);

export default router;
