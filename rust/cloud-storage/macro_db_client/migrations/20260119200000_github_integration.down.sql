-- Drop indexes first
DROP INDEX IF EXISTS idx_github_links_github_username;
DROP INDEX IF EXISTS idx_github_links_macro_id;
DROP INDEX IF EXISTS uq_github_links_github_user_id;
DROP INDEX IF EXISTS uq_github_links_fusionauth_user_id;

-- Drop table
DROP TABLE IF EXISTS public.github_links;
