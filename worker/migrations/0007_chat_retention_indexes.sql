-- Support efficient global oldest-chat retention without scanning message content per user.
CREATE INDEX IF NOT EXISTS idx_chats_retention_order ON chats(updated_at ASC,id ASC,user_email);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_owner ON chat_messages(chat_id,user_email);
