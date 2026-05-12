import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },

    matric_number: {
        type: String,
        unique: true,
        required: true,
    },
    department: {
        type: String,
        required: true,
    },

    phone_number: {
        type: String,
        required: true,
    },
    embedding: { // store the student's facial embeddings as an array of numbers
        type: String, // we can store the embeddings as a JSON string
        required: true,
    },
    iv: { // store the initialization vector for encryption
        type: String,
        required: true,
    },
}, { timestamps: true });

studentSchema.index({ createdAt: -1 });
studentSchema.index({ name: 1 });
studentSchema.index({ department: 1 });

export default mongoose.model('Student', studentSchema);
