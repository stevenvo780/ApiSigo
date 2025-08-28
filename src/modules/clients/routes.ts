import { Router } from "express";
import { createClient, validateClient } from "./controller";
import { extractSigoCredentials } from "@/middleware/sigoCredentials";

const router = Router();

router.post("/", extractSigoCredentials, validateClient, createClient);

export default router;
