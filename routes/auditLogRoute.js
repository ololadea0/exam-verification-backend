import { Router } from "express";
import {
    getAuditLogs,
    getRegistrationTimingSummary
} from "../controllers/auditLogController.js";
import { protect } from "../middleware/authMiddleware.js";

const auditLogRoutes = Router();

auditLogRoutes.get("/registration-timing-summary", protect, getRegistrationTimingSummary);
auditLogRoutes.get("/", protect, getAuditLogs);

export default auditLogRoutes;
