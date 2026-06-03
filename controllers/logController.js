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
            .populate("course", "course_code course_title")
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

const getTimingSummary = asyncHandler(async (req, res) => {
    const successfulOnly = req.query.successfulOnly !== "false";
    const match = {
        "timing.total_turnaround_ms": { $type: "number" }
    };

    if (successfulOnly)
    {
        match.verified = true;
    }

    if (req.query.course_id)
    {
        match.course = req.query.course_id;
    }

    const [summary] = await Log.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                attempts: { $sum: 1 },
                database_lookup_min: { $min: "$timing.database_lookup_ms" },
                database_lookup_max: { $max: "$timing.database_lookup_ms" },
                database_lookup_mean: { $avg: "$timing.database_lookup_ms" },
                database_lookup_std_dev: { $stdDevPop: "$timing.database_lookup_ms" },
                face_service_min: { $min: "$timing.face_service_call_ms" },
                face_service_max: { $max: "$timing.face_service_call_ms" },
                face_service_mean: { $avg: "$timing.face_service_call_ms" },
                face_service_std_dev: { $stdDevPop: "$timing.face_service_call_ms" },
                python_processing_min: { $min: "$timing.python_processing_time_ms" },
                python_processing_max: { $max: "$timing.python_processing_time_ms" },
                python_processing_mean: { $avg: "$timing.python_processing_time_ms" },
                python_processing_std_dev: { $stdDevPop: "$timing.python_processing_time_ms" },
                template_decryption_min: { $min: "$timing.template_decryption_ms" },
                template_decryption_max: { $max: "$timing.template_decryption_ms" },
                template_decryption_mean: { $avg: "$timing.template_decryption_ms" },
                template_decryption_std_dev: { $stdDevPop: "$timing.template_decryption_ms" },
                match_computation_min: { $min: "$timing.match_computation_ms" },
                match_computation_max: { $max: "$timing.match_computation_ms" },
                match_computation_mean: { $avg: "$timing.match_computation_ms" },
                match_computation_std_dev: { $stdDevPop: "$timing.match_computation_ms" },
                attendance_write_min: { $min: "$timing.attendance_write_ms" },
                attendance_write_max: { $max: "$timing.attendance_write_ms" },
                attendance_write_mean: { $avg: "$timing.attendance_write_ms" },
                attendance_write_std_dev: { $stdDevPop: "$timing.attendance_write_ms" },
                log_write_min: { $min: "$timing.log_write_ms" },
                log_write_max: { $max: "$timing.log_write_ms" },
                log_write_mean: { $avg: "$timing.log_write_ms" },
                log_write_std_dev: { $stdDevPop: "$timing.log_write_ms" },
                total_turnaround_min: { $min: "$timing.total_turnaround_ms" },
                total_turnaround_max: { $max: "$timing.total_turnaround_ms" },
                total_turnaround_mean: { $avg: "$timing.total_turnaround_ms" },
                total_turnaround_std_dev: { $stdDevPop: "$timing.total_turnaround_ms" }
            }
        }
    ]);

    const round = (value) =>
        typeof value === "number" ? Math.round(value * 100) / 100 : 0;

    const row = (key, label) => ({
        stage: label,
        min_ms: round(summary?.[`${key}_min`]),
        max_ms: round(summary?.[`${key}_max`]),
        mean_ms: round(summary?.[`${key}_mean`]),
        std_dev_ms: round(summary?.[`${key}_std_dev`])
    });

    return res.status(200).json({
        attempts: summary?.attempts || 0,
        successfulOnly,
        stages: [
            row("database_lookup", "Database Query and Retrieval"),
            row("face_service", "Face Service Request"),
            row("python_processing", "Face Detection and Embedding Generation"),
            row("template_decryption", "Stored Template Decryption"),
            row("match_computation", "Cosine Similarity Computation"),
            row("attendance_write", "Attendance Record Write"),
            row("log_write", "Verification Log Write"),
            row("total_turnaround", "Total Turnaround Time")
        ]
    });
});

export { getLogs, getTimingSummary };
