-- Additive, non-breaking migration for Hybrid CBT Objective + Paper 2 Theory Scoring Architecture
-- Preserves all existing Result records untouched (legacy rows default to ExamResultStatus = 'COMPLETED').

DO $$ BEGIN
  CREATE TYPE "ExamMode" AS ENUM ('COMBINED', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExamResultStatus" AS ENUM ('PENDING', 'PARTIALLY_MARKED', 'COMPLETED', 'APPROVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SubjectExamConfig" (
  "id" TEXT NOT NULL,
  "ClassID" INTEGER NOT NULL,
  "SubjectID" INTEGER NOT NULL,
  "TermID" INTEGER NOT NULL,
  "ExamMode" "ExamMode" NOT NULL DEFAULT 'COMBINED',
  "ExamCbtMaxTenths" INTEGER NOT NULL DEFAULT 400,
  "ExamTheoryMaxTenths" INTEGER NOT NULL DEFAULT 200,
  "ConfiguredById" INTEGER,
  "CreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "UpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubjectExamConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubjectExamConfig_ClassID_fkey" FOREIGN KEY ("ClassID") REFERENCES "Class"("ClassID") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubjectExamConfig_SubjectID_fkey" FOREIGN KEY ("SubjectID") REFERENCES "Subject"("SubjectID") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubjectExamConfig_TermID_fkey" FOREIGN KEY ("TermID") REFERENCES "Academic_Term"("TermID") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubjectExamConfig_ClassID_SubjectID_TermID_key"
  ON "SubjectExamConfig"("ClassID", "SubjectID", "TermID");

CREATE INDEX IF NOT EXISTS "SubjectExamConfig_TermID_ExamMode_idx"
  ON "SubjectExamConfig"("TermID", "ExamMode");

ALTER TABLE "Result"
  ADD COLUMN IF NOT EXISTS "ExamCbtTenths" INTEGER,
  ADD COLUMN IF NOT EXISTS "ExamTheoryTenths" INTEGER,
  ADD COLUMN IF NOT EXISTS "ExamCbtMaxTenths" INTEGER,
  ADD COLUMN IF NOT EXISTS "ExamTheoryMaxTenths" INTEGER,
  ADD COLUMN IF NOT EXISTS "ExamResultStatus" "ExamResultStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "LastCbtSyncExamId" TEXT,
  ADD COLUMN IF NOT EXISTS "LastCbtSyncAttemptId" TEXT,
  ADD COLUMN IF NOT EXISTS "LastCbtSyncAt" TIMESTAMP(3);
