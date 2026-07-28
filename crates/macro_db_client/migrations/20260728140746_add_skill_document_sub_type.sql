-- Add 'skill' to the document sub type enum.
-- Skills are markdown documents that can be referenced in an AI chat input
-- via a `/<skillname>` slash command; their content is injected into the
-- AI system prompt.
ALTER TYPE document_sub_type_value ADD VALUE IF NOT EXISTS 'skill';
