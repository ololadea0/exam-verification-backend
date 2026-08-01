import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import Admin from "../models/adminModel.js";

const protect = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.adminToken;

    console.log("=== PROTECT ===");
    console.log("URL:", req.originalUrl);
    console.log("Method:", req.method);
    console.log("Token exists:", !!token);

    if (!token)
    {
        console.log("❌ NO TOKEN");
        return res.status(401).json({
            message: "Not authorized, no session"
        });
    }

    try
    {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        console.log("✅ JWT valid");
        console.log("Decoded ID:", decoded.id);

        const admin = await Admin.findById(decoded.id).select("-password");

        console.log("Admin found:", !!admin);

        if (!admin)
        {
            console.log("❌ ADMIN NOT FOUND");
            return res.status(401).json({
                message: "Not authorized, admin not found"
            });
        }

        req.admin = admin;
        next();

    } catch (error)
    {
        console.log("❌ JWT ERROR:", error.message);

        return res.status(401).json({
            message: "Not authorized, session failed"
        });
    }
});

export { protect };
