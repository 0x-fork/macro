CREATE TABLE "DocumentSyncServiceState" (
    "documentId" TEXT PRIMARY KEY REFERENCES "Document"(id) ON DELETE CASCADE,
    "initializedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "versionId" TEXT,
    "snapshotKey" TEXT,
    "snapshotSha256" TEXT,
    "snapshotSizeBytes" BIGINT,
    "snapshotUpdatedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "DocumentSyncServiceState_snapshotUpdatedAt_idx"
ON "DocumentSyncServiceState" ("snapshotUpdatedAt");
