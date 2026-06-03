import asyncHandler from "express-async-handler";
import Attendance from "../models/attendanceModel.js";
import Student from "../models/studentModel.js";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const getPagination = (query) => {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const requestedLimit = Number.parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const getAttendance = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const search = req.query.search?.trim();
    const date = req.query.date?.trim();
    const courseId = req.query.course_id?.trim();
    const filter = {};

    if (search)
    {
        const students = await Student.find({
            $or: [
                { name: { $regex: search, $options: "i" } },
                { matric_number: { $regex: search, $options: "i" } },
                { department: { $regex: search, $options: "i" } }
            ]
        }).select("_id");

        filter.$or = [
            { matric_number: { $regex: search, $options: "i" } },
            { student: { $in: students.map((student) => student._id) } }
        ];
    }

    if (date)
    {
        filter.attendance_date = date;
    }

    if (courseId)
    {
        filter.course = courseId;
    }

    const [attendance, total] = await Promise.all([
        Attendance.find(filter)
            .populate("student", "name matric_number department")
            .populate("course", "course_code course_title")
            .sort({ verified_at: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Attendance.countDocuments(filter)
    ]);

    return res.status(200).json({
        attendance,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
});

export { getAttendance };
