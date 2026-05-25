import { Router } from "express";
import { getAttendance } from "../controllers/attendanceController.js";
import { protect } from "../middleware/authMiddleware.js";

const attendanceRoutes = Router();

attendanceRoutes.get("/", protect, getAttendance);

export default attendanceRoutes;
