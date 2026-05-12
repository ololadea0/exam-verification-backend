import asyncHandler from "express-async-handler";
import Student from "../models/studentModel.js";
import Log from "../models/logModel.js";
import { decrypt } from "../utils/encryption.js";
import { cosineSimilarity } from "../utils/math.js";
import { getPythonEmbedding } from "../services/pythonService.js";

const hasValidIv = (iv) => typeof iv === "string"
    && iv.length === 32
    && /^[0-9a-fA-F]+$/.test(iv);

const FACE_CAPTURE_ERROR = "Face capture is not clear enough. Please retake the photo with one visible face and good lighting.";
const FACE_SERVICE_ERROR = "Face recognition service is not ready. Please check the server logs.";
const SIMILARITY_THRESHOLD = 0.65;
const MIN_MARGIN = 0.05;

const isFaceServiceError = (error) => {
    const message = error?.message || "";

    return message.includes("Traceback")
        || message.includes("ModuleNotFoundError")
        || message.includes("ImportError")
        || message.includes("Unable to start Python embedding process")
        || message.includes("Python embedding script was not found");
};

const verifyStudent = asyncHandler(async (req, res) => {
    const { matric_number, image } = req.body;

    if (!matric_number || !image)
    {
        return res.status(400).json({
            message: "Matric number and image required"
        });
    }

    const matric = matric_number.trim();

    // 1. find student
    const student = await Student.findOne({ matric_number: matric });

    if (!student)
    {
        return res.status(404).json({ message: "Student not found" });
    }

    // 2. get embedding from python
    let embeddingResult;

    try
    {
        embeddingResult = await getPythonEmbedding(image);
    } catch (error)
    {
        console.error("Face verification embedding failed:", error.message);
        const serviceError = isFaceServiceError(error);

        return res.status(serviceError ? 500 : 400).json({

            message: serviceError
                ? FACE_SERVICE_ERROR
                : error.message || FACE_CAPTURE_ERROR,

            details: serviceError
                ? undefined
                : error.message
        });
    }

    if (!Array.isArray(embeddingResult?.embedding) || embeddingResult.embedding.length === 0)
    {
        return res.status(400).json({
            message: FACE_CAPTURE_ERROR
        });
    }

    const liveEmbedding = embeddingResult.embedding;

    // 3. decrypt stored embedding

    if (!hasValidIv(student.iv))
    {
        return res.status(422).json({
            message: "Student face data is invalid. Please re-register this student."
        });
    }

    let storedEmbedding;

    try
    {
        storedEmbedding = JSON.parse(
            decrypt(student.embedding, student.iv)
        );
    } catch
    {
        return res.status(422).json({
            message: "Student face data cannot be decrypted. Please re-register this student's face."
        });
    }

    if (!Array.isArray(storedEmbedding) || storedEmbedding.length !== liveEmbedding.length)
    {
        return res.status(422).json({
            message: "Student face data is incompatible. Please re-register this student."
        });
    }

    // 4. compare against requested student
    const similarity = cosineSimilarity(storedEmbedding, liveEmbedding);

    // 5. also check all other students to detect ambiguous matches
    const allStudents = await Student.find({}, "name matric_number embedding iv");
    const allScores = [];

    for (const s of allStudents)
    {
        if (!hasValidIv(s.iv) || s._id.toString() === student._id.toString())
        {
            continue;
        }

        try
        {
            const stored = JSON.parse(decrypt(s.embedding, s.iv));
            if (Array.isArray(stored) && stored.length === liveEmbedding.length)
            {
                allScores.push({
                    studentId: s._id.toString(),
                    name: s.name,
                    matric: s.matric_number,
                    similarity: cosineSimilarity(stored, liveEmbedding)
                });
            }
        } catch
        {
            continue;
        }
    }

    allScores.sort((a, b) => b.similarity - a.similarity);

    const bestMatch = allScores[0];

    const secondBestSimilarity = bestMatch
        ? bestMatch.similarity
        : 0;

    const margin = similarity - secondBestSimilarity;

    const match =
        similarity >= SIMILARITY_THRESHOLD
        && margin >= MIN_MARGIN;

    const confidence = Math.max(0, similarity);

    // 6. log
    await Log.create({
        student: student._id,
        timestamp: new Date(),
        status: match ? "success" : "failure",
        matric_number: student.matric_number,
        verified: match,
        confidence,
        method: "facial_recognition"
    });

    // 7. response
    return res.json({
        verified: match,
        confidence,
        similarity,
        ...(bestMatch && bestMatch.similarity > 0.6 ? { ambiguityWarning: `Face is also similar to ${bestMatch.name}` } : {}),
        student: {
            name: student.name,
            matric_number: student.matric_number,
            department: student.department,
            phone_number: student.phone_number
        }
    });
});

export { verifyStudent };
