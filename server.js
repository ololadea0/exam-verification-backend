import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import colors from 'colors';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import adminRoutes from './routes/adminRoute.js';
import studentRoutes from './routes/studentRoute.js';
import verifyStudentRoutes from './routes/verifyStudentRoute.js';
import logRoutes from './routes/logRoute.js';
import errorHandler from './middleware/errormiddleware.js';
import cookieParser from 'cookie-parser';


dotenv.config();

// Connect to database (optional in development)
if (process.env.MONGO_URI)
{
    try
    {
        await connectDB();
    } catch (error)
    {
        console.warn('Database connection failed, continuing without database:'.yellow, error.message);
    }
} else
{
    console.warn('No MONGO_URI provided, running without database'.yellow);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = process.env.PORT || 8000;

const app = express();

app.use(cors({
    origin: [
        process.env.FRONTEND_URL || "http://localhost:5173",
    ],
    credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use(cookieParser());

app.use('/api/admin', adminRoutes);// Admin routes
app.use('/api/students', studentRoutes);// Student routes
app.use('/api/verify-student', verifyStudentRoutes);// Verify student routes
app.use('/api/logs', logRoutes);// Verification log routes


app.get('/health', (req, res) => {
    res.json({ status: "ok" });
});


app.get('/', (req, res) => {
    res.send('API is running...');
});


app.use(errorHandler);

app.listen(port, () => {
    console.log(`Server is running on port ${port}.`.green.underline);
});

