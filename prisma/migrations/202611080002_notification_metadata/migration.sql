-- Add semantic context for localization without changing previously saved messages.
ALTER TABLE "Notification" ADD COLUMN "metadata" JSONB;
