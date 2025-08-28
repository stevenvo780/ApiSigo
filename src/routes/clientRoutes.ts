import { Router } from "express";
import { createClient, validateClient } from "@/controllers/clientController";

const router = Router();

/**
 * @route   POST /api/clients
 * @desc    Crear nuevo cliente
 * @access  Private
 */
router.post("/", validateClient, createClient);

export default router;
