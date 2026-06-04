import mongoose from "mongoose";

const logsSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
    },
    course_code: {
        type: String,
        required: true,
    },
    course_title: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['success', 'failure'],
        required: true,
    },
    matric_number: {
        type: String,
        required: true,
    },
    verified: {
        type: Boolean,
        required: true,
    },
    confidence: {
        type: Number,
        required: true,
    },
    similarity: {
        type: Number,
    },
    method: {
        type: String,
        default: "facial_recognition",
    },
    timing: {
        database_lookup_ms: Number,
        face_service_call_ms: Number,
        face_detection_ms: Number,
        feature_extraction_ms: Number,
        embedding_generation_ms: Number,
        python_processing_time_ms: Number,
        template_decryption_ms: Number,
        match_computation_ms: Number,
        attendance_write_ms: Number,
        log_write_ms: Number,
        total_turnaround_ms: Number,
    },
}, { timestamps: true });

logsSchema.index({ timestamp: -1, createdAt: -1 });
logsSchema.index({ matric_number: 1 });
logsSchema.index({ course_code: 1 });
logsSchema.index({ student: 1 });

export default mongoose.model('Log', logsSchema);
