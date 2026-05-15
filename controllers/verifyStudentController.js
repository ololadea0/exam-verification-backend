import asyncHandler from "express-async-handler";
import Student from "../models/studentModel.js";
import Log from "../models/logModel.js";
import { decrypt } from "../utils/encryption.js";
import { cosineSimilarity } from "../utils/math.js";
import { getPythonEmbedding } from "../services/pythonService.js";

const SIMILARITY_THRESHOLD = 0.65;

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

const getReadableFaceError = (message = "") => {

    const lower = message.toLowerCase();

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

    if (lower.includes("invalid image"))
    {
        return "Captured image is invalid.";
    }

    return "Face capture failed. Please retake the photo.";
};

const verifyStudent = asyncHandler(async (req, res) => {

    const { matric_number, image } = req.body;

    // -----------------------------
    // VALIDATE REQUEST
    // -----------------------------
    if (!matric_number || !image)
    {
        return res.status(400).json({
            message: "Matric number and image are required."
        });
    }

    const matric = matric_number.trim();

    // -----------------------------
    // FIND STUDENT
    // -----------------------------
    const student = await Student.findOne({
        matric_number: matric
    });

    if (!student)
    {
        return res.status(404).json({
            message: "Student not found."
        });
    }

    // -----------------------------
    // GET LIVE EMBEDDING
    // -----------------------------
    let embeddingResult;

    try
    {

        embeddingResult = await getPythonEmbedding(image);

    } catch (error)
    {

        console.error("PYTHON FACE ERROR:");
        console.error(error.message);

        const rawMessage = error?.message || "";

        const serviceError = isFaceServiceError(rawMessage);

        return res.status(serviceError ? 500 : 400).json({

            message: serviceError
                ? FACE_SERVICE_ERROR
                : getReadableFaceError(rawMessage),

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

        storedEmbedding = JSON.parse(
            decrypt(student.embedding, student.iv)
        );

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
    const similarity = cosineSimilarity(
        storedEmbedding,
        liveEmbedding
    );

    // -----------------------------
    // FINAL MATCH DECISION
    // -----------------------------
    const verified = similarity >= SIMILARITY_THRESHOLD;

    const confidence = Math.max(0, similarity);

    // -----------------------------
    // LOG ATTEMPT
    // -----------------------------
    try
    {

        await Log.create({
            student: student._id,
            timestamp: new Date(),
            status: verified ? "success" : "failure",
            matric_number: student.matric_number,
            verified,
            confidence,
            similarity,
            method: "facial_recognition"
        });

    } catch (error)
    {

        console.error("LOG ERROR:", error.message);
    }

    // -----------------------------
    // RESPONSE
    // -----------------------------
    return res.json({

        verified,

        confidence,

        similarity,

        metrics: embeddingResult.metrics,

        student: {
            name: student.name,
            matric_number: student.matric_number,
            department: student.department,
            phone_number: student.phone_number
        }
    });
});

export { verifyStudent };
