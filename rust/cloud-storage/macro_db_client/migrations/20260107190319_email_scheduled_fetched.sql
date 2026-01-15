-- Add migration script here
ALTER TABLE public.email_scheduled_messages
    ADD COLUMN fetched_to_send boolean DEFAULT false NOT NULL;