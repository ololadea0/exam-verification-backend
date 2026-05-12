import { Router } from "express";
import {
    authAdmin,
    getCurrentAdmin,
    logoutAdmin,
    registerAdmin
} from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";

const adminRoutes = Router();

adminRoutes.post('/register', registerAdmin);
adminRoutes.post('/login', authAdmin);
adminRoutes.get('/me', protect, getCurrentAdmin);
adminRoutes.post('/logout', logoutAdmin);

export default adminRoutes;
