import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import tsconfigPaths from 'vite-tsconfig-paths';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const mock = (find: RegExp, file: string) => ({
  find,
  replacement: r(`./mocks/${file}`),
});

export default defineConfig({
  root: r('.'),
  plugins: [
    tailwind(),
    tsconfigPaths({ root: r('..') }),
    solid(),
    solidSvg({ defaultAsComponent: true }),
  ],
  resolve: {
    dedupe: ['solid-js'],
    alias: [
      mock(/^@app\/lib\/analytics\/analytics-context$/, 'analytics.ts'),
      mock(/^@core\/context\/user$/, 'user.ts'),
      mock(/^@queries\/contacts\/contacts$/, 'contacts.ts'),
      mock(/^@queries\/onboarding$/, 'onboarding.ts'),
      mock(/^@queries\/team\/invitations$/, 'invitations.ts'),
      mock(/^@queries\/team\/teams$/, 'teams.ts'),
    ],
  },
  server: {
    port: 5199,
    fs: { allow: [r('../../..')] },
  },
});
