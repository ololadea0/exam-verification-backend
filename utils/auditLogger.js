import AuditLog from "../models/auditLogModel.js";

export const logAdminAction = async (
    req,
    { action, entity, entityId, metadata = {} }
) => {
    try
    {
        await AuditLog.create({
            admin: req.admin?._id,
            admin_email: req.admin?.email || metadata.admin_email,
            action,
            entity,
            entity_id: entityId?.toString(),
            metadata,
            ip_address: req.ip,
            user_agent: req.get("user-agent")
        });
    } catch (error)
    {
        console.error("AUDIT LOG ERROR:", error.message);
    }
};
