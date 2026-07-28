import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Student from "../models/studentModel.js";
import Log from "../models/logModel.js";
import Attendance from "../models/attendanceModel.js";
import Course from "../models/courseModel.js";
import { decrypt } from "../utils/encryption.js";
import { cosineSimilarity } from "../utils/math.js";
import { getPythonEmbedding } from "../services/pythonService.js";

const SIMILARITY_THRESHOLD = Number.parseFloat(
    process.env.VERIFICATION_MATCH_THRESHOLD || "0.65"
);
const MAX_VERIFICATION_TIME_MS = Number.parseInt(
    process.env.MAX_VERIFICATION_TIME_MS || "10000",
    10
);

const FACE_SERVICE_ERROR =
    "Face recognition service is currently unavailable.";

const hasValidIv = (iv) =>
    typeof iv === "string" &&
    iv.length === 32 &&
    /^[0-9a-fA-F]+$/.test(iv);

const isFaceServiceError = (message = "") => {
    return (
        message.includes("Traceback") ||
        message.includes("ModuleNotFoundError") ||
        message.includes("ImportError") ||
        message.includes("Connection refused") ||
        message.includes("ECONNREFUSED") ||
        message.includes("timeout") ||
        message.includes("Network Error")
    );
};

const isPythonServiceFailure = (error) => {
    if (error?.isFaceCaptureFailure) return false;
    if (error?.isFaceServiceFailure) return true;
    if (error?.statusCode >= 500) return true;

    return isFaceServiceError(error?.message || "");
};

const getReadableFaceError = (message = "") => {

    const lower = message.toLowerCase();

    if (lower.includes("no usable face"))
    {
        return "No usable face detected. Please retake the photo.";
    }

    if (lower.includes("no face detected"))
    {
        return "No face detected. Ensure your face is fully visible.";
    }

    if (lower.includes("face too small"))
    {
        return "Move closer to the camera.";
    }

    if (lower.includes("face too close"))
    {
        return "Move slightly away from the camera.";
    }

    if (lower.includes("blurry"))
    {
        return "Image is blurry. Hold the camera steady.";
    }

    if (lower.includes("lighting"))
    {
        return "Lighting is too poor for recognition.";
    }

    if (lower.includes("confidence"))
    {
        return "Face could not be detected clearly.";
    }

    if (lower.includes("multiple faces"))
    {
        return "Only one face should appear in the frame.";
    }

    if (lower.includes("detail") || lower.includes("contrast"))
    {
        return "Face detail is too low. Retake the photo with clearer focus.";
    }

    if (lower.includes("invalid image"))
    {
        return "Captured image is invalid.";
    }

    return "Face capture failed. Please retake the photo.";
};

const getAttendanceDate = () => new Date().toISOString().slice(0, 10);
const elapsedMs = (startedAt) => Math.round((Date.now() - startedAt) * 100) / 100;
const remainingVerificationMs = (startedAt) =>
    Math.max(0, MAX_VERIFICATION_TIME_MS - (Date.now() - startedAt));

const getVerificationTimeoutResponse = (startedAt) => ({
    message: "Verification exceeded the 10-second processing limit. Please try again.",
    durationMs: Date.now() - startedAt,
    maxDurationMs: MAX_VERIFICATION_TIME_MS
});

const verifyStudent = asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    const timing = {
        database_lookup_ms: 0,
        face_service_call_ms: 0,
        face_detection_ms: 0,
        feature_extraction_ms: 0,
        embedding_generation_ms: 0,
        python_processing_time_ms: 0,
        template_decryption_ms: 0,
        match_computation_ms: 0,
        attendance_write_ms: 0,
        log_write_ms: 0,
        total_turnaround_ms: 0
    };

    const { matric_number, image, course_id } = req.body;

    // -----------------------------
    // VALIDATE REQUEST
    // -----------------------------
    if (!matric_number || !image || !course_id)
    {
        return res.status(400).json({
            message: "Matric number, course, and image are required."
        });
    }

    const matric = matric_number.trim();

    // -----------------------------
    // FIND STUDENT
    // -----------------------------
    let stageStartedAt = Date.now();
    const student = await Student.findOne({
        matric_number: matric
    });
    timing.database_lookup_ms += elapsedMs(stageStartedAt);

    if (!student)
    {
        return res.status(404).json({
            message: "Student not found."
        });
    }

    if (!mongoose.isValidObjectId(course_id))
    {
        return res.status(400).json({
            message: "A valid course is required."
        });
    }

    stageStartedAt = Date.now();
    const course = await Course.findOne({
        _id: course_id,
        active: true
    });
    timing.database_lookup_ms += elapsedMs(stageStartedAt);

    if (!course)
    {
        return res.status(404).json({
            message: "Course not found or inactive."
        });
    }

    // -----------------------------
    // GET LIVE EMBEDDING
    // -----------------------------
    let embeddingResult;

    try
    {

        stageStartedAt = Date.now();
        const remainingMs = remainingVerificationMs(startedAt);

        if (remainingMs <= 0)
        {
            return res.status(504).json(getVerificationTimeoutResponse(startedAt));
        }

        embeddingResult = await getPythonEmbedding(image, remainingMs);
        timing.face_service_call_ms = elapsedMs(stageStartedAt);
        timing.face_detection_ms = embeddingResult.metrics?.face_detection_ms || 0;
        timing.feature_extraction_ms = embeddingResult.metrics?.feature_extraction_ms || 0;
        timing.embedding_generation_ms = embeddingResult.metrics?.embedding_generation_ms || 0;
        timing.python_processing_time_ms = embeddingResult.processing_time_ms || 0;

    } catch (error)
    {

        console.error("PYTHON FACE ERROR:");
        console.error(error.message);

        const rawMessage = error?.message || "";

        const serviceError = isPythonServiceFailure(error);

        return res.status(serviceError ? 500 : 400).json({

            message: serviceError
                ? FACE_SERVICE_ERROR
                : getReadableFaceError(rawMessage),

            details:
                process.env.NODE_ENV !== "production"
                    ? rawMessage
                    : undefined,

            debug:
                process.env.NODE_ENV !== "production"
                    ? rawMessage
                    : undefined
        });
    }

    // -----------------------------
    // VALIDATE EMBEDDING
    // -----------------------------
    if (
        !Array.isArray(embeddingResult?.embedding) ||
        embeddingResult.embedding.length === 0
    )
    {
        const rawMessage =
            embeddingResult?.error ||
            embeddingResult?.detail ||
            "Face embedding generation failed";

        return res.status(400).json({
            message: getReadableFaceError(rawMessage),
            debug:
                process.env.NODE_ENV !== "production"
                    ? rawMessage
                    : undefined
        });
    }

    const liveEmbedding = embeddingResult.embedding;
    const elapsedAfterEmbedding = Date.now() - startedAt;

    if (elapsedAfterEmbedding > MAX_VERIFICATION_TIME_MS)
    {
        return res.status(504).json(getVerificationTimeoutResponse(startedAt));
    }

    // -----------------------------
    // VALIDATE ENCRYPTED DATA
    // -----------------------------
    if (!hasValidIv(student.iv))
    {

        return res.status(422).json({
            message:
                "Student biometric data is invalid. Re-register student."
        });
    }

    // -----------------------------
    // DECRYPT STORED EMBEDDING
    // -----------------------------
    let storedEmbedding;

    try
    {

        stageStartedAt = Date.now();
        storedEmbedding = JSON.parse(
            decrypt(student.embedding, student.iv)
        );
        timing.template_decryption_ms = elapsedMs(stageStartedAt);

    } catch (error)
    {

        console.error("DECRYPT ERROR:", error.message);

        return res.status(422).json({
            message:
                "Stored biometric data could not be decrypted."
        });
    }

    // -----------------------------
    // VALIDATE STORED EMBEDDING
    // -----------------------------
    if (
        !Array.isArray(storedEmbedding) ||
        storedEmbedding.length !== liveEmbedding.length
    )
    {
        return res.status(422).json({
            message:
                "Stored biometric data is incompatible."
        });
    }

    // -----------------------------
    // MAIN SIMILARITY
    // -----------------------------
    stageStartedAt = Date.now();
    const similarity = cosineSimilarity(
        storedEmbedding,
        liveEmbedding
    );
    timing.match_computation_ms = elapsedMs(stageStartedAt);

    // -----------------------------
    // FINAL MATCH DECISION
    // -----------------------------
    const verified = similarity >= SIMILARITY_THRESHOLD;

    const confidence = Math.max(0, similarity);
    let attendance = null;

    if (Date.now() - startedAt > MAX_VERIFICATION_TIME_MS)
    {
        return res.status(504).json(getVerificationTimeoutResponse(startedAt));
    }

    if (verified)
    {
        try
        {
            stageStartedAt = Date.now();
            const attendanceDate = getAttendanceDate();
            const existingAttendance = await Attendance.findOne({
                student: student._id,
                course: course._id,
                attendance_date: attendanceDate
            });

            if (existingAttendance)
            {
                attendance = {
                    record: existingAttendance,
                    alreadyMarked: true
                };
            } else
            {
                const attendanceRecord = await Attendance.create({
                    student: student._id,
                    course: course._id,
                    course_code: course.course_code,
                    course_title: course.course_title,
                    matric_number: student.matric_number,
                    attendance_date: attendanceDate,
                    verified_at: new Date(),
                    confidence,
                    similarity,
                    method: "facial_recognition"
                });

                attendance = {
                    record: attendanceRecord,
                    alreadyMarked: false
                };
            }
            timing.attendance_write_ms = elapsedMs(stageStartedAt);
        } catch (error)
        {
            console.error("ATTENDANCE LOG ERROR:", error.message);
        }
    }

    // -----------------------------
    // RESPONSE
    // -----------------------------
    timing.total_turnaround_ms = Date.now() - startedAt;

    try
    {
        stageStartedAt = Date.now();
        const log = await Log.create({
            student: student._id,
            course: course._id,
            course_code: course.course_code,
            course_title: course.course_title,
            timestamp: new Date(),
            status: verified ? "success" : "failure",
            matric_number: student.matric_number,
            verified,
            confidence,
            similarity,
            method: "facial_recognition",
            timing
        });
        timing.log_write_ms = elapsedMs(stageStartedAt);
        timing.total_turnaround_ms = Date.now() - startedAt;
        log.timing = timing;
        await log.save();
    } catch (error)
    {
        console.error("LOG ERROR:", error.message);
    }

    return res.json({

        verified,

        message: verified
            ? "Student verified successfully. Attendance has been recorded."
            : "Face did not match the selected matric number. Attendance was not recorded.",

        confidence,

        similarity,

        metrics: embeddingResult.metrics,

        durationMs: timing.total_turnaround_ms,

        processing_time_ms: embeddingResult.processing_time_ms,

        timing,

        attendance: attendance
            ? {
                marked: true,
                alreadyMarked: attendance.alreadyMarked,
                attendance_date: attendance.record.attendance_date,
                verified_at: attendance.record.verified_at
            }
            : {
                marked: false
            },

        student: {
            name: student.name,
            matric_number: student.matric_number,
            department: student.department
        },

        course: {
            _id: course._id,
            course_code: course.course_code,
            course_title: course.course_title
        }
    });
});

export { verifyStudent };
