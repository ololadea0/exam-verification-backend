import { Router } from "express";
import { getAuditLogs } from "../controllers/auditLogController.js";
import { protect } from "../middleware/authMiddleware.js";

const auditLogRoutes = Router();

auditLogRoutes.get("/", protect, getAuditLogs);

export default auditLogRoutes;
