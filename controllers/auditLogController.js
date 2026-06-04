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

const getRegistrationTimingSummary = asyncHandler(async (req, res) => {
    const match = {
        action: "student.register",
        "metadata.timing.total_registration_ms": { $type: "number" }
    };

    const [summary] = await AuditLog.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                attempts: { $sum: 1 },
                duplicate_matric_lookup_min: { $min: "$metadata.timing.duplicate_matric_lookup_ms" },
                duplicate_matric_lookup_max: { $max: "$metadata.timing.duplicate_matric_lookup_ms" },
                duplicate_matric_lookup_mean: { $avg: "$metadata.timing.duplicate_matric_lookup_ms" },
                duplicate_matric_lookup_std_dev: { $stdDevPop: "$metadata.timing.duplicate_matric_lookup_ms" },
                face_service_min: { $min: "$metadata.timing.face_service_call_ms" },
                face_service_max: { $max: "$metadata.timing.face_service_call_ms" },
                face_service_mean: { $avg: "$metadata.timing.face_service_call_ms" },
                face_service_std_dev: { $stdDevPop: "$metadata.timing.face_service_call_ms" },
                face_detection_min: { $min: "$metadata.timing.face_detection_ms" },
                face_detection_max: { $max: "$metadata.timing.face_detection_ms" },
                face_detection_mean: { $avg: "$metadata.timing.face_detection_ms" },
                face_detection_std_dev: { $stdDevPop: "$metadata.timing.face_detection_ms" },
                feature_extraction_min: { $min: "$metadata.timing.feature_extraction_ms" },
                feature_extraction_max: { $max: "$metadata.timing.feature_extraction_ms" },
                feature_extraction_mean: { $avg: "$metadata.timing.feature_extraction_ms" },
                feature_extraction_std_dev: { $stdDevPop: "$metadata.timing.feature_extraction_ms" },
                embedding_generation_min: { $min: "$metadata.timing.embedding_generation_ms" },
                embedding_generation_max: { $max: "$metadata.timing.embedding_generation_ms" },
                embedding_generation_mean: { $avg: "$metadata.timing.embedding_generation_ms" },
                embedding_generation_std_dev: { $stdDevPop: "$metadata.timing.embedding_generation_ms" },
                python_processing_min: { $min: "$metadata.timing.python_processing_time_ms" },
                python_processing_max: { $max: "$metadata.timing.python_processing_time_ms" },
                python_processing_mean: { $avg: "$metadata.timing.python_processing_time_ms" },
                python_processing_std_dev: { $stdDevPop: "$metadata.timing.python_processing_time_ms" },
                duplicate_face_lookup_and_match_min: { $min: "$metadata.timing.duplicate_face_lookup_and_match_ms" },
                duplicate_face_lookup_and_match_max: { $max: "$metadata.timing.duplicate_face_lookup_and_match_ms" },
                duplicate_face_lookup_and_match_mean: { $avg: "$metadata.timing.duplicate_face_lookup_and_match_ms" },
                duplicate_face_lookup_and_match_std_dev: { $stdDevPop: "$metadata.timing.duplicate_face_lookup_and_match_ms" },
                embedding_encryption_min: { $min: "$metadata.timing.embedding_encryption_ms" },
                embedding_encryption_max: { $max: "$metadata.timing.embedding_encryption_ms" },
                embedding_encryption_mean: { $avg: "$metadata.timing.embedding_encryption_ms" },
                embedding_encryption_std_dev: { $stdDevPop: "$metadata.timing.embedding_encryption_ms" },
                database_write_min: { $min: "$metadata.timing.database_write_ms" },
                database_write_max: { $max: "$metadata.timing.database_write_ms" },
                database_write_mean: { $avg: "$metadata.timing.database_write_ms" },
                database_write_std_dev: { $stdDevPop: "$metadata.timing.database_write_ms" },
                total_registration_min: { $min: "$metadata.timing.total_registration_ms" },
                total_registration_max: { $max: "$metadata.timing.total_registration_ms" },
                total_registration_mean: { $avg: "$metadata.timing.total_registration_ms" },
                total_registration_std_dev: { $stdDevPop: "$metadata.timing.total_registration_ms" }
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
        stages: [
            row("duplicate_matric_lookup", "Duplicate Matric Number Lookup"),
            row("face_detection", "Face Detection"),
            row("feature_extraction", "Feature Extraction (FaceNet)"),
            row("embedding_generation", "Embedding Generation"),
            row("face_service", "Face Service Request"),
            row("python_processing", "Face Detection and Embedding Generation"),
            row("duplicate_face_lookup_and_match", "Duplicate Face Lookup and Match Computation"),
            row("embedding_encryption", "Embedding Encryption"),
            row("database_write", "Student Database Write"),
            row("total_registration", "Total Registration Time")
        ]
    });
});

export { getAuditLogs, getRegistrationTimingSummary };
