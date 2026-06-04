import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
    course_code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
    },
    course_title: {
        type: String,
        required: true,
        trim: true,
    },
    department: {
        type: String,
        trim: true,
        default: "",
    },
    active: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

courseSchema.index({ active: 1, course_code: 1 });

export default mongoose.model("Course", courseSchema);
