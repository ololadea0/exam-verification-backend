import { Router } from "express";
import { getLogs } from "../controllers/logController.js";
import { protect } from "../middleware/authMiddleware.js";

const logRoutes = Router();

logRoutes.get("/", protect, getLogs);

export default logRoutes;
