DROP TRIGGER outbox_delivery_append_only ON outbox_delivery;
DROP FUNCTION prevent_outbox_delivery_mutation();
DROP TABLE outbox_delivery;

DROP TRIGGER notification_projection_protected ON notification;
DROP FUNCTION protect_notification_projection();
DROP INDEX notification_unread_idx;
DROP INDEX notification_recipient_idx;
DROP TABLE notification;
