import asyncHandler from "express-async-handler";
import Course from "../models/courseModel.js";
import { logAdminAction } from "../utils/auditLogger.js";

const normalizeCourseCode = (value = "") => value.trim().toUpperCase();

const getCourses = asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const search = req.query.search?.trim();
    const filter = includeInactive ? {} : { active: true };

    if (search)
    {
        filter.$or = [
            { course_code: { $regex: search, $options: "i" } },
            { course_title: { $regex: search, $options: "i" } },
            { department: { $regex: search, $options: "i" } }
        ];
    }

    const courses = await Course.find(filter)
        .sort({ course_code: 1 })
        .lean();

    return res.status(200).json({ courses });
});

const createCourse = asyncHandler(async (req, res) => {
    const course_code = normalizeCourseCode(req.body.course_code);
    const course_title = req.body.course_title?.trim();
    const department = req.body.department?.trim() || "";

    if (!course_code || !course_title)
    {
        return res.status(400).json({
            message: "Course code and course title are required."
        });
    }

    const existingCourse = await Course.findOne({ course_code });

    if (existingCourse)
    {
        return res.status(409).json({
            message: "Course already exists."
        });
    }

    const course = await Course.create({
        course_code,
        course_title,
        department
    });

    await logAdminAction(req, {
        action: "course.create",
        entity: "course",
        entityId: course._id,
        metadata: {
            course_code: course.course_code,
            course_title: course.course_title
        }
    });

    return res.status(201).json({
        message: "Course created successfully.",
        course
    });
});

const updateCourse = asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.id);

    if (!course)
    {
        return res.status(404).json({ message: "Course not found." });
    }

    if (req.body.course_code !== undefined)
    {
        course.course_code = normalizeCourseCode(req.body.course_code);
    }

    if (req.body.course_title !== undefined)
    {
        course.course_title = req.body.course_title.trim();
    }

    if (req.body.department !== undefined)
    {
        course.department = req.body.department.trim();
    }

    if (req.body.active !== undefined)
    {
        course.active = Boolean(req.body.active);
    }

    if (!course.course_code || !course.course_title)
    {
        return res.status(400).json({
            message: "Course code and course title are required."
        });
    }

    const updatedCourse = await course.save();

    await logAdminAction(req, {
        action: "course.update",
        entity: "course",
        entityId: updatedCourse._id,
        metadata: {
            course_code: updatedCourse.course_code,
            course_title: updatedCourse.course_title,
            active: updatedCourse.active
        }
    });

    return res.status(200).json({
        message: "Course updated successfully.",
        course: updatedCourse
    });
});

const deleteCourse = asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.id);

    if (!course)
    {
        return res.status(404).json({ message: "Course not found." });
    }

    const metadata = {
        course_code: course.course_code,
        course_title: course.course_title
    };

    await course.deleteOne();

    await logAdminAction(req, {
        action: "course.delete",
        entity: "course",
        entityId: req.params.id,
        metadata
    });

    return res.status(200).json({
        message: "Course deleted successfully.",
        id: req.params.id
    });
});

export { getCourses, createCourse, updateCourse, deleteCourse };
