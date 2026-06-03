import { Router } from "express";
import { getLogs, getTimingSummary } from "../controllers/logController.js";
import { protect } from "../middleware/authMiddleware.js";

const logRoutes = Router();

logRoutes.get("/timing-summary", protect, getTimingSummary);
logRoutes.get("/", protect, getLogs);

export default logRoutes;
