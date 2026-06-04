import Student from "../models/studentModel.js";
import asyncHandler from "express-async-handler";
import { encrypt, decrypt } from "../utils/encryption.js";
import { getBestPythonEmbedding } from "../services/pythonService.js";
import { cosineSimilarity } from "../utils/math.js";
import { logAdminAction } from "../utils/auditLogger.js";

const FACE_CAPTURE_ERROR =
    "Face capture is unclear. Ensure good lighting and one visible face.";

const FACE_SERVICE_ERROR =
    "Face service unavailable. Try again later.";

const ENROLLMENT_DUPLICATE_THRESHOLD = Number.parseFloat(
    process.env.ENROLLMENT_DUPLICATE_THRESHOLD || "0.78"
);
const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;
const STUDENT_PUBLIC_FIELDS = "-embedding -iv";

const hasValidIv = (iv) =>
    typeof iv === "string" &&
    iv.length === 32 &&
    /^[a-fA-F0-9]+$/.test(iv);


const getPagination = (query) => {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};
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

const isPythonServiceFailure = (error) => {
    if (error?.isFaceCaptureFailure) return false;
    if (error?.isFaceServiceFailure) return true;
    if (error?.statusCode >= 500) return true;

    return isFaceServiceError(error?.message || "");
};

const normalizeError = (msg = "") => {
    const m = msg.toLowerCase();

    if (m.includes("no usable face")) return "No usable face detected.";
    if (m.includes("no face")) return "No face detected.";
    if (m.includes("blurry")) return "Image is blurry.";
    if (m.includes("lighting")) return "Poor lighting.";
    if (m.includes("confidence")) return "Face could not be detected clearly.";
    if (m.includes("expected") && m.includes("embedding")) return "Face model configuration mismatch.";
    if (m.includes("multiple")) return "Only one face allowed.";
    if (m.includes("small")) return "Move closer to camera.";
    if (m.includes("close")) return "Move slightly away.";

    return FACE_CAPTURE_ERROR;
};

const getPublicStudentById = (studentId) =>
    Student.findById(studentId).select(STUDENT_PUBLIC_FIELDS);

const formatSimilarityPercent = (similarity) =>
    `${Math.round(Math.max(0, similarity) * 100)}%`;

const findMatchingFaceStudent = async (embedding, excludedStudentId = null) => {
    const students = await Student.find({}, "name matric_number embedding iv");
    let best = null;

    for (const student of students)
    {
        if (
            excludedStudentId &&
            student._id.toString() === excludedStudentId.toString()
        )
        {
            continue;
        }

        if (!hasValidIv(student.iv)) continue;

        try
        {
            const stored = JSON.parse(decrypt(student.embedding, student.iv));

            if (!Array.isArray(stored) || stored.length !== embedding.length)
            {
                continue;
            }

            const similarity = cosineSimilarity(stored, embedding);

            if (!best || similarity > best.similarity)
            {
                best = { student, similarity };
            }
        } catch
        {
            continue;
        }
    }

    return best && best.similarity >= ENROLLMENT_DUPLICATE_THRESHOLD
        ? best
        : null;
};

// ------------------------------
// MAIN REGISTER
// ------------------------------
const registerStudent = asyncHandler(async (req, res) => {

    const { name, matric_number, department, image, images } = req.body;

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
        const serviceError = isPythonServiceFailure(error);

        return res.status(serviceError ? 500 : 400).json({
            message: serviceError
                ? FACE_SERVICE_ERROR
                : normalizeError(msg),
            details:
                process.env.NODE_ENV !== "production"
                    ? msg
                    : undefined,
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

    const matchingFace = await findMatchingFaceStudent(embedding);

    if (matchingFace)
    {
        return res.status(409).json({
            message: `Face already registered for ${matchingFace.student.name} (${formatSimilarityPercent(matchingFace.similarity)} match).`,
            matchedStudent: {
                name: matchingFace.student.name,
                matric_number: matchingFace.student.matric_number
            },
            similarity: matchingFace.similarity
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
        embedding: encryptedEmbedding,
        iv
    });

    await logAdminAction(req, {
        action: "student.register",
        entity: "student",
        entityId: student._id,
        metadata: {
            matric_number: student.matric_number,
            department: student.department
        }
    });

    return res.status(201).json({
        message: "Student registered successfully",
        student: {
            _id: student._id,
            name: student.name,
            matric_number: student.matric_number,
            department: student.department
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

    const { name, department } = req.body;

    const updatedStudent = await Student.findByIdAndUpdate(
        req.params.id,
        {
            ...(name !== undefined && { name }),
            ...(department !== undefined && { department })
        },
        { new: true, runValidators: true }
    ).select(STUDENT_PUBLIC_FIELDS);

    await logAdminAction(req, {
        action: "student.update",
        entity: "student",
        entityId: updatedStudent._id,
        metadata: {
            matric_number: updatedStudent.matric_number,
            updated_fields: Object.keys({
                ...(name !== undefined && { name }),
                ...(department !== undefined && { department })
            })
        }
    });

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
        const msg = error?.message || "";
        const serviceError = isPythonServiceFailure(error);

        return res.status(serviceError ? 500 : 400).json({

            message: serviceError
                ? FACE_SERVICE_ERROR
                : normalizeError(msg),

            details:
                process.env.NODE_ENV !== "production" || !serviceError
                    ? msg
                    : undefined
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
        return res.status(409).json({
            message: `This face is already enrolled for ${matchingFace.student.name} (${matchingFace.student.matric_number}) with a ${formatSimilarityPercent(matchingFace.similarity)} match.`,
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

    await logAdminAction(req, {
        action: "student.face_update",
        entity: "student",
        entityId: updatedStudent._id,
        metadata: {
            matric_number: updatedStudent.matric_number
        }
    });

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
                { department: { $regex: search, $options: "i" } }
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

    await logAdminAction(req, {
        action: "student.delete",
        entity: "student",
        entityId: req.params.id,
        metadata: {
            matric_number: student.matric_number
        }
    });

    return res.status(200).json({
        message: "Student deleted successfully",
        id: req.params.id
    });
});

export { registerStudent, editStudent, updateStudentFace, getStudents, deleteStudent };
