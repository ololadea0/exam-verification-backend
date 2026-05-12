import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import Admin from "../models/adminModel.js";
import { cookieName } from "../controllers/adminController.js";

const getCookieValue = (req, name) => {
    const cookies = req.headers.cookie;

    if (!cookies)
    {
        return null;
    }

    return cookies
        .split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${name}=`))
        ?.split("=")[1] || null;
};

const protect = asyncHandler(async (req, res, next) => {
    const token = getCookieValue(req, cookieName);

    if (token)
    {
        try
        {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get admin from the token
            req.admin = await Admin.findById(decoded.id).select('-password');

            if (!req.admin)
            {
                return res.status(401).json({ message: 'Not authorized, admin not found' });
            }

            next();
        } catch (error)
        {
            console.error(error);
            return res.status(401).json({ message: 'Not authorized, session failed' });
        }
    } else
    {
        return res.status(401).json({ message: 'Not authorized, no session' });
    }
});

export { protect };
