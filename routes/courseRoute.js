import { Router } from "express";
import {
    createCourse,
    deleteCourse,
    getCourses,
    updateCourse
} from "../controllers/courseController.js";
import { protect } from "../middleware/authMiddleware.js";

const courseRoutes = Router();

courseRoutes.get("/", protect, getCourses);
courseRoutes.post("/", protect, createCourse);
courseRoutes.put("/:id", protect, updateCourse);
courseRoutes.delete("/:id", protect, deleteCourse);

export default courseRoutes;
