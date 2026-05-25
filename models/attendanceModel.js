import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true,
    },
    matric_number: {
        type: String,
        required: true,
    },
    attendance_date: {
        type: String,
        required: true,
    },
    verified_at: {
        type: Date,
        default: Date.now,
    },
    confidence: {
        type: Number,
        required: true,
    },
    similarity: {
        type: Number,
        required: true,
    },
    method: {
        type: String,
        default: "facial_recognition",
    },
}, { timestamps: true });

attendanceSchema.index(
    { student: 1, attendance_date: 1 },
    { unique: true }
);
attendanceSchema.index({ matric_number: 1 });
attendanceSchema.index({ verified_at: -1 });

export default mongoose.model("Attendance", attendanceSchema);
