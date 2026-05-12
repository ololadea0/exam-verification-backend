import Student from "../models/studentModel.js";
import asyncHandler from "express-async-handler";
import { encrypt, decrypt } from "../utils/encryption.js";
import { getBestPythonEmbedding } from "../services/pythonService.js";
import { cosineSimilarity } from "../utils/math.js";

const FACE_CAPTURE_ERROR =
    "Face capture is unclear. Ensure good lighting and one visible face.";

const FACE_SERVICE_ERROR =
    "Face service unavailable. Try again later.";

const SIMILARITY_THRESHOLD = 0.72;
const MIN_MARGIN = 0.05;

const hasValidIv = (iv) =>
    typeof iv === "string" &&
    iv.length === 32 &&
    /^[a-fA-F0-9]+$/.test(iv);

const isFaceServiceError = (msg = "") =>
    [
        "Traceback",
        "ModuleNotFoundError",
        "ImportError",
        "ECONNREFUSED",
        "timeout",
        "spawn",
        "ENOENT"
    ].some((err) => msg.includes(err));

const normalizeError = (msg = "") => {
    const m = msg.toLowerCase();

    if (m.includes("no face")) return "No face detected.";
    if (m.includes("blurry")) return "Image is blurry.";
    if (m.includes("lighting")) return "Poor lighting.";
    if (m.includes("multiple")) return "Only one face allowed.";
    if (m.includes("small")) return "Move closer to camera.";
    if (m.includes("close")) return "Move slightly away.";

    return FACE_CAPTURE_ERROR;
};

// ------------------------------
// MAIN REGISTER
// ------------------------------
const registerStudent = asyncHandler(async (req, res) => {

    const { name, matric_number, department, image, images, phone_number } = req.body;

    const captureImages =
        Array.isArray(images) && images.length > 0
            ? images
            : [image].filter(Boolean);

    if (!name || !matric_number || !department || captureImages.length === 0)
    {
        return res.status(400).json({
            message: "All fields including image are required"
        });
    }

    const matric = matric_number.trim();

    const exists = await Student.findOne({ matric_number: matric });

    if (exists)
    {
        return res.status(400).json({
            message: "Student already exists"
        });
    }

    // ------------------------------
    // PYTHON EMBEDDING
    // ------------------------------
    let result;

    try
    {
        result = await getBestPythonEmbedding(captureImages);

    } catch (error)
    {

        const msg = error?.message || "";
        const serviceError = isFaceServiceError(msg);

        return res.status(serviceError ? 500 : 400).json({
            message: serviceError
                ? FACE_SERVICE_ERROR
                : normalizeError(msg),
            debug:
                process.env.NODE_ENV !== "production"
                    ? msg
                    : undefined
        });
    }

    const embedding = result?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0)
    {
        return res.status(400).json({
            message: FACE_CAPTURE_ERROR
        });
    }

    // ------------------------------
    // FACE MATCH CHECK
    // ------------------------------
    const students = await Student.find({}, "name matric_number embedding iv");

    let best = null;
    let secondBest = null;

    for (const s of students)
    {

        if (!hasValidIv(s.iv)) continue;

        try
        {
            const stored = JSON.parse(decrypt(s.embedding, s.iv));

            if (!Array.isArray(stored)) continue;
            if (stored.length !== embedding.length) continue;

            const sim = cosineSimilarity(stored, embedding);

            if (!best || sim > best.similarity)
            {
                secondBest = best;
                best = { student: s, similarity: sim };
            } else if (!secondBest || sim > secondBest.similarity)
            {
                secondBest = { student: s, similarity: sim };
            }

        } catch
        {
            continue;
        }
    }

    if (best && best.similarity >= SIMILARITY_THRESHOLD)
    {

        const margin =
            best.similarity - (secondBest?.similarity || 0);

        if (margin < MIN_MARGIN)
        {
            return res.status(409).json({
                message: "Face matches multiple students. Retake clearer image.",
                topMatch: best.student.name,
                secondMatch: secondBest?.student.name,
                margin
            });
        }

        return res.status(409).json({
            message: `Face already registered for ${best.student.name}`,
            matchedStudent: {
                name: best.student.name,
                matric_number: best.student.matric_number
            },
            similarity: best.similarity
        });
    }

    // ------------------------------
    // SAVE NEW STUDENT
    // ------------------------------
    const { encryptedEmbedding, iv } =
        encrypt(JSON.stringify(embedding));

    const student = await Student.create({
        name,
        matric_number: matric,
        department,
        phone_number,
        embedding: encryptedEmbedding,
        iv
    });

    return res.status(201).json({
        message: "Student registered successfully",
        student: {
            _id: student._id,
            name: student.name,
            matric_number: student.matric_number,
            department: student.department,
            phone_number: student.phone_number
        }
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
