import { z } from 'zod';

const envSchema = z.object({
  MACRO_API_KEY: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_REPO: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'must be "owner/name"'),
  MACRO_ENV: z.enum(['dev', 'prod', 'local']).default('prod'),
  REFRESH_SECS: z.coerce.number().positive().default(60),
  SYNC_DB_PATH: z.string().default('sync.db'),
});

export const env = envSchema.parse(process.env);
