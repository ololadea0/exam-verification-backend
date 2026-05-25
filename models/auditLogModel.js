import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
    },
    admin_email: {
        type: String,
    },
    action: {
        type: String,
        required: true,
    },
    entity: {
        type: String,
        required: true,
    },
    entity_id: {
        type: String,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
    },
    ip_address: {
        type: String,
    },
    user_agent: {
        type: String,
    },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ admin: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ entity: 1 });

export default mongoose.model("AuditLog", auditLogSchema);
