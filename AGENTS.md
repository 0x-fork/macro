# Macro Development Guide

## Overview

Macro is an all-in-one productivity platform (email, messaging, docs, files, AI chat, search). The frontend is a SolidJS + Vite web app in `js/app/`, and the backend consists of ~15 Rust microservices orchestrated via Docker Compose. See `README.md` for architecture and `RUNNING_LOCALLY.md` for full local setup.

## Cursor Cloud specific instructions

### System prerequisites

The VM snapshot includes: `bun` (v1.3.5), `just`, Docker (with fuse-overlayfs + iptables-legacy configured), and Node.js. The update script runs `bun install` in `js/app/` on every session start.

### Frontend (js/app)

- **Dev server**: `cd js/app && VITE_LOCAL_SERVERS='ALL' bun run --bun dev` (port 3000). Omit `VITE_LOCAL_SERVERS` to point at dev-assets instead of local backend.
- **Lint**: `bun run lint` (Biome)
- **Type check**: `bun run check`
- **Tests**: `bun run test` runs all vitest projects. The `storybook` project requires Playwright browser (`npx playwright install`); skip it with `--project core --project websocket --project queries --project scripts --project lexical-core --project block-theme --project block-channel --project notifications` to run non-browser tests only.
- **Format**: `bun run format`
- See `js/app/AGENTS.md` for code style and testing conventions.

### Backend (Rust services via Docker)

- Backend services require a `.env` file at the workspace root, decrypted from `.env-local.enc` via `sops` with AWS KMS. Without AWS credentials (`SOPS_KMS_ARN`), backend services cannot start.
- Docker networks `databases` and `auth` must exist: `just create_networks`.
- Databases (no `.env` needed): `sudo docker compose -f docker-compose-databases.yml up postgres redis -d --wait`.
- Full backend: `just run_local` (requires `.env`).
- Rust services are built via `Dockerfile.dev` multi-target builds. First run requires `just rust/cloud-storage/build_dev_service_images`.

### Docker gotchas in Cloud VM

- Docker daemon must be started manually: `sudo dockerd &>/tmp/dockerd.log &`
- Use `sudo docker ...` (or ensure docker group membership is active).
- `fuse-overlayfs` storage driver and `iptables-legacy` are required (pre-configured in snapshot).

### Key ports

| Service | Port |
|---------|------|
| Frontend (Vite) | 3000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Redis UI | 8001 |
| Auth service | 8080 |
| Connection gateway | 8082 |
| Doc storage | 8086 |
| Email service | 8087 |
| Sync service | 8787 |
