import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi.json',
  output: {
    path: './generated',
    format: 'prettier',
    lint: 'biome',
  },
  plugins: [
    '@hey-api/typescript',
    '@hey-api/client-fetch',
    '@tanstack/solid-query',
  ],
});
