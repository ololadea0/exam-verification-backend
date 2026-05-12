import { Router } from "express";
import { verifyStudent } from "../controllers/verifyStudentController.js";
import { protect } from "../middleware/authMiddleware.js";

const verifyStudentRoutes = Router();

verifyStudentRoutes.post('/', protect, verifyStudent);

export default verifyStudentRoutes;