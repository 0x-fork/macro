ALTER TABLE "Document"
ADD COLUMN "syncServiceInitializedAt" TIMESTAMPTZ,
ADD COLUMN "syncServiceVersionId" TEXT,
ADD COLUMN "syncServiceSnapshotKey" TEXT,
ADD COLUMN "syncServiceSnapshotSha256" TEXT,
ADD COLUMN "syncServiceSnapshotSizeBytes" BIGINT,
ADD COLUMN "syncServiceSnapshotUpdatedAt" TIMESTAMPTZ;

CREATE INDEX "Document_md_syncServiceInitializedAt_idx"
ON "Document" ("syncServiceInitializedAt")
WHERE "fileType" = 'md'
  AND "deletedAt" IS NULL
  AND "syncServiceInitializedAt" IS NOT NULL;
