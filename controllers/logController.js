import asyncHandler from "express-async-handler";
import Log from "../models/logModel.js";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const getPagination = (query) => {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const getLogs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const search = req.query.search?.trim();
    const filter = search
        ? { matric_number: { $regex: search, $options: "i" } }
        : {};

    const [logs, total] = await Promise.all([
        Log.find(filter)
            .populate("student", "name matric_number department")
            .sort({ timestamp: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Log.countDocuments(filter)
    ]);

    return res.status(200).json({
        logs,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

export { getLogs };
