import Student from "../models/studentModel.js";
import asyncHandler from "express-async-handler";
import { decrypt, encrypt } from "../utils/encryption.js";
import { getBestPythonEmbedding } from "../services/pythonService.js";
import { cosineSimilarity } from "../utils/math.js";

const FACE_CAPTURE_ERROR = "Face capture is not clear enough. Please retake the photo with one visible face and good lighting.";
const FACE_SERVICE_ERROR = "Face recognition service is not ready. Please check the server logs.";
const SIMILARITY_THRESHOLD = 0.72;
const MIN_MARGIN = 0.05;
const STUDENT_PUBLIC_FIELDS = "-embedding -iv";
const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;

const isFaceServiceError = (error) => {
    const message = error?.message || "";

    return message.includes("Traceback")
        || message.includes("ModuleNotFoundError")
        || message.includes("ImportError")
        || message.includes("Unable to start Python embedding process")
        || message.includes("Failed to parse Python JSON")
        || message.includes("Python process timed out")
        || message.includes("spawn")
        || message.includes("ENOENT")
        || message.includes("Python embedding script was not found");
};

const getPagination = (query) => {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const getPublicStudentById = (id) =>
    Student.findById(id).select(STUDENT_PUBLIC_FIELDS);

const hasValidIv = (iv) => typeof iv === "string"
    && iv.length === 32
    && /^[0-9a-fA-F]+$/.test(iv);

const findMatchingFaceStudent = async (embedding, excludeStudentId = null) => {
    const students = await Student.find({}, "name matric_number embedding iv");

    let best = null;
    let secondBest = null;

    for (const student of students)
    {

        if (excludeStudentId && student._id.toString() === excludeStudentId.toString())
        {
            continue;
        }

        if (!hasValidIv(student.iv)) continue;

        let stored;

        try
        {
            stored = JSON.parse(decrypt(student.embedding, student.iv));
        } catch
        {
            continue;
        }

        if (!Array.isArray(stored) || stored.length !== embedding.length) continue;

        const sim = cosineSimilarity(stored, embedding);

        if (!best || sim > best.similarity)
        {
            secondBest = best;
            best = { student, similarity: sim };
        } else if (!secondBest || sim > secondBest.similarity)
        {
            secondBest = { student, similarity: sim };
        }
    }

    if (!best || best.similarity < SIMILARITY_THRESHOLD)
    {
        return null;
    }

    const margin = secondBest ? best.similarity - secondBest.similarity : 1;

    if (margin < MIN_MARGIN)
    {
        return {
            ambiguous: true,
            best,
            secondBest,
            margin
        };
    }

    return {
        student: best.student,
        similarity: best.similarity
    };
};

// POST /api/students
const registerStudent = asyncHandler(async (req, res) => {
    const { name, matric_number, department, image, images, phone_number } = req.body;

    const captureImages = Array.isArray(images) && images.length > 0
        ? images
        : [image].filter(Boolean);

    if (!name || !matric_number || !department || captureImages.length === 0)
    {
        return res.status(400).json({
            message: "All fields including image are required"
        });
    }

    const trimmedMatric = matric_number.trim();

    const studentExists = await Student.findOne({ matric_number: trimmedMatric });

    if (studentExists)
    {
        return res.status(400).json({
            message: "Student already exists"
        });
    }

    let result;

    try
    {
        result = await getBestPythonEmbedding(captureImages);
    } catch (error)
    {
        const serviceError = isFaceServiceError(error);

        return res.status(serviceError ? 500 : 400).json({
            message: serviceError
                ? FACE_SERVICE_ERROR
                : error.message || FACE_CAPTURE_ERROR,
            details: serviceError ? undefined : error.message
        });
    }

    const embedding = result?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0)
    {
        return res.status(400).json({
            message: FACE_CAPTURE_ERROR
        });
    }

    const match = await findMatchingFaceStudent(embedding);

    if (match)
    {
        if (match.ambiguous)
        {
            return res.status(409).json({
                message: "Face is too similar to multiple existing students. Please retake clearer images.",
                topMatch: match.best.student.name,
                secondMatch: match.secondBest.student.name,
                margin: match.margin
            });
        }

        return res.status(409).json({
            message: `This face already belongs to ${match.student.name} (${match.student.matric_number})`,
            matchedStudent: {
                name: match.student.name,
                matric_number: match.student.matric_number
            },
            similarity: match.similarity
        });
    }

    const { encryptedEmbedding, iv } = encrypt(JSON.stringify(embedding));

    const student = await Student.create({
        name,
        matric_number: trimmedMatric,
        department,
        phone_number,
        embedding: encryptedEmbedding,
        iv
    });

    return res.status(201).json({
        message: "Student registered successfully",
        student: await getPublicStudentById(student._id)
    });
});
// @desc Edit student data
// @route PUT /api/students/:id
// @access Private

const editStudent = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id);

    if (!student)
    {
        return res.status(404).json({ message: "Student not found" });
    }

    const { name, department, phone_number } = req.body;

    const updatedStudent = await Student.findByIdAndUpdate(
        req.params.id,
        {
            ...(name !== undefined && { name }),
            ...(department !== undefined && { department }),
            ...(phone_number !== undefined && { phone_number })
        },
        { new: true, runValidators: true }
    ).select(STUDENT_PUBLIC_FIELDS);

    return res.status(200).json({
        message: "Student updated successfully",
        student: updatedStudent
    });
});

// @desc Update student face data
// @route PUT /api/students/:id/face
// @access Private
const updateStudentFace = asyncHandler(async (req, res) => {
    const { image, images } = req.body;
    const captureImages = Array.isArray(images) && images.length > 0
        ? images
        : [image].filter(Boolean);

    if (captureImages.length === 0)
    {
        return res.status(400).json({
            message: "At least one face image is required"
        });
    }

    const student = await Student.findById(req.params.id);

    if (!student)
    {
        return res.status(404).json({ message: "Student not found" });
    }

    let result;

    try
    {
        result = await getBestPythonEmbedding(captureImages);
    } catch (error)
    {
        console.error("Student face re-registration embedding failed:", error.message);
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

    if (!Array.isArray(result?.embedding) || result.embedding.length === 0)
    {
        return res.status(400).json({
            message: FACE_CAPTURE_ERROR
        });
    }

    const matchingFace = await findMatchingFaceStudent(result.embedding, student._id);

    if (matchingFace)
    {
        if (matchingFace.ambiguous)
        {
            return res.status(409).json({
                message: `Face is ambiguous. It matches multiple students. Margin: ${matchingFace.margin.toFixed(4)}. Please retake with clearer image.`,
                topMatch: matchingFace.best.student.name,
                secondMatch: matchingFace.secondBest.student.name,
                margin: matchingFace.margin
            });
        }

        return res.status(409).json({
            message: `This face is already enrolled for ${matchingFace.student.name} (${matchingFace.student.matric_number}).`,
            matchedStudent: {
                name: matchingFace.student.name,
                matric_number: matchingFace.student.matric_number
            },
            similarity: matchingFace.similarity
        });
    }

    const { encryptedEmbedding, iv } = encrypt(
        JSON.stringify(result.embedding)
    );

    student.embedding = encryptedEmbedding;
    student.iv = iv;
    const updatedStudent = await student.save();

    return res.status(200).json({
        message: "Student face re-registered successfully",
        student: await getPublicStudentById(updatedStudent._id)
    });
});

// @desc Get all students
// @route GET /api/students
// @access Private
const getStudents = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const search = req.query.search?.trim();
    const filter = search
        ? {
            $or: [
                { name: { $regex: search, $options: "i" } },
                { matric_number: { $regex: search, $options: "i" } },
                { department: { $regex: search, $options: "i" } },
                { phone_number: { $regex: search, $options: "i" } }
            ]
        }
        : {};

    const [students, total] = await Promise.all([
        Student.find(filter)
            .select(STUDENT_PUBLIC_FIELDS)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Student.countDocuments(filter)
    ]);

    return res.status(200).json({
        students,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

// @desc Delete student
// @route DELETE /api/students/:id
// @access Private
const deleteStudent = asyncHandler(async (req, res) => {
    const student = await Student.findById(req.params.id);

    if (!student)
    {
        return res.status(404).json({ message: "Student not found" });
    }

    await student.deleteOne();

    return res.status(200).json({
        message: "Student deleted successfully",
        id: req.params.id
    });
});

export { registerStudent, editStudent, updateStudentFace, getStudents, deleteStudent };
