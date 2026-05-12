import mongoose from "mongoose";

const logsSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
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
}, { timestamps: true });

logsSchema.index({ timestamp: -1, createdAt: -1 });
logsSchema.index({ matric_number: 1 });
logsSchema.index({ student: 1 });

export default mongoose.model('Log', logsSchema);
