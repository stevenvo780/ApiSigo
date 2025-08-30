import { Router } from "express";
import { createClient, validateClient } from "./controller";

const router = Router();

// POST /api/clients - Crear cliente
router.post("/", validateClient, createClient);

export default router;
