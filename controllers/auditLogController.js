import asyncHandler from "express-async-handler";
import AuditLog from "../models/auditLogModel.js";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const getPagination = (query) => {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const getAuditLogs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const search = req.query.search?.trim();
    const filter = search
        ? {
            $or: [
                { admin_email: { $regex: search, $options: "i" } },
                { action: { $regex: search, $options: "i" } },
                { entity: { $regex: search, $options: "i" } },
                { entity_id: { $regex: search, $options: "i" } }
            ]
        }
        : {};

    const [auditLogs, total] = await Promise.all([
        AuditLog.find(filter)
            .populate("admin", "email username")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        AuditLog.countDocuments(filter)
    ]);

    return res.status(200).json({
        auditLogs,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

export { getAuditLogs };
