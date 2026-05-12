import { Router } from "express";
import {
    deleteStudent,
    editStudent,
    getStudents,
    registerStudent,
    updateStudentFace
} from "../controllers/studentController.js";
import { protect } from "../middleware/authMiddleware.js";


const studentRoutes = Router();

studentRoutes.get('/', protect, getStudents);
studentRoutes.post('/register', protect, registerStudent);
studentRoutes.put('/:id/face', protect, updateStudentFace);
studentRoutes.put('/:id', protect, editStudent);
studentRoutes.delete('/:id', protect, deleteStudent);

export default studentRoutes;
