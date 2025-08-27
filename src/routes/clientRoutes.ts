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

const router = Router();

/**
 * @route   POST /api/clients
 * @desc    Crear nuevo cliente
 * @access  Private
 */
router.post("/", validateClient, createClient);

/**
 * @route   GET /api/clients
 * @desc    Obtener lista de clientes con paginación
 * @access  Private
 */
router.get("/", getClients);

/**
 * @route   GET /api/clients/search
 * @desc    Buscar clientes por término
 * @access  Private
 */
router.get("/search", searchClients);

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
 * @route   GET /api/clients/:tipoDocumento/:numeroDocumento
 * @desc    Obtener cliente específico
 * @access  Private
 */
router.get("/:tipoDocumento/:numeroDocumento", validateClientParams, getClient);

/**
 * @route   PUT /api/clients/:tipoDocumento/:numeroDocumento
 * @desc    Actualizar cliente
 * @access  Private
 */
router.put(
  "/:tipoDocumento/:numeroDocumento",
  validateClientParams,
  updateClient,
);

/**
 * @route   DELETE /api/clients/:tipoDocumento/:numeroDocumento
 * @desc    Eliminar cliente
 * @access  Private
 */
router.delete(
  "/:tipoDocumento/:numeroDocumento",
  validateClientParams,
  deleteClient,
);

/**
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
