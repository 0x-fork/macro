# Onboarding team-step harness

Renders `features/setup/flow/TeamStep` on its own — real component, real
Tailwind theme, no backend — so the screen can be driven and screenshotted
without a logged-in session.

The hooks the step needs (user email, contacts, onboarding state, team
queries/mutations, analytics) are swapped for fixtures in `mocks/` via Vite
aliases; everything else is the real code.

```bash
bunx vite -c harness/vite.config.ts      # http://localhost:5199
bun harness/shoot.mjs ./shots            # drive it + write screenshots
```

Query params:

- `?scenario=prefill` (default) — work-domain user with same-domain contacts,
  so teammates arrive pre-added to the invite list
- `?scenario=plain` — personal-email user: no suggested domain, no prefill
- `?theme=dark` — Macro Dark instead of Macro Light

`shoot.mjs` also asserts behavior as it goes (which rows are pre-added, what
the remove buttons drop, what the mutation and analytics event receive) and
exits non-zero on a page error, so it doubles as a smoke test.

This directory sits outside `tsconfig.json`'s `include` and knip's `project`
globs on purpose — it is dev tooling, not shipped code.
