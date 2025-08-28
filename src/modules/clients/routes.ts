import { Router } from "express";
import { createClient, validateClient } from "./controller";
import { extractSigoCredentialsWithAuth } from "@/middleware/sigoCredentials";

const router = Router();

// POST /api/clients - Crear cliente  
router.post("/", extractSigoCredentialsWithAuth, validateClient, createClient);

export default router;
