import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import Admin from "../models/adminModel.js";

const protect = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.adminToken;

    if (!token)
    {
        return res.status(401).json({
            message: "Not authorized, no session"
        });
    }

    try
    {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const admin = await Admin.findById(decoded.id).select("-password");

        if (!admin)
        {
            return res.status(401).json({
                message: "Not authorized, admin not found"
            });
        }

        req.admin = admin;
        next();

    } catch (error)
    {
        return res.status(401).json({
            message: "Not authorized, session failed"
        });
    }
});

export { protect };
