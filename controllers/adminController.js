import Admin from "../models/adminModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { logAdminAction } from "../utils/auditLogger.js";

const cookieName = "adminToken";
const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000
};

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const getAdminResponse = (admin) => ({
    _id: admin._id,
    name: admin.name,
    email: admin.email
});

const sendTokenCookie = (res, adminId) => {
    res.cookie(cookieName, generateToken(adminId), cookieOptions);
};

// @desc    Register a new admin
// @route   POST /api/admin/register
// @access  Public
const registerAdmin = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const adminExists = await Admin.findOne({ email });
    if (adminExists)
    {
        res.status(400).json({ message: 'Admin already exists' });
        return;
    } else
    {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const admin = await Admin.create({
            name,
            email,
            password: hashedPassword
        });
        if (admin)
        {
            sendTokenCookie(res, admin._id);
            req.admin = admin;
            await logAdminAction(req, {
                action: "admin.register",
                entity: "admin",
                entityId: admin._id,
                metadata: { admin_email: admin.email }
            });
            res.status(201).json(getAdminResponse(admin));
        } else
        {
            res.status(400).json({ message: 'Invalid admin data' });
            return;
        }
    }
});

// @desc    Authenticate admin & get token
// @route   POST /api/admin/login
// @access  Public
const authAdmin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (admin && (await bcrypt.compare(password, admin.password)))
    {
        sendTokenCookie(res, admin._id);
        req.admin = admin;
        await logAdminAction(req, {
            action: "admin.login",
            entity: "admin",
            entityId: admin._id,
            metadata: { admin_email: admin.email }
        });
        res.json(getAdminResponse(admin));
    } else
    {
        res.status(401).json({ message: 'Invalid email or password' });
        return;
    }
});

// @desc    Get current admin session
// @route   GET /api/admin/me
// @access  Private
const getCurrentAdmin = asyncHandler(async (req, res) => {
    res.json(getAdminResponse(req.admin));
});

// @desc    Logout admin
// @route   POST /api/admin/logout
// @access  Private
const logoutAdmin = asyncHandler(async (req, res) => {
    await logAdminAction(req, {
        action: "admin.logout",
        entity: "admin",
        entityId: req.admin?._id,
        metadata: { admin_email: req.admin?.email }
    });

    res.clearCookie(cookieName, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax"
    });

    res.json({ message: "Logged out successfully" });
});




export { registerAdmin, authAdmin, getCurrentAdmin, logoutAdmin, generateToken, cookieName };
