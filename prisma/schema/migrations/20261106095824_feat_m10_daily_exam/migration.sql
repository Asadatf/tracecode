-- CreateTable
CREATE TABLE "exam_problems" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" JSONB NOT NULL,
    "examples" JSONB NOT NULL,
    "practiceTests" JSONB NOT NULL,
    "starter" TEXT NOT NULL,
    "entry" TEXT NOT NULL,
    "hiddenCases" JSONB NOT NULL,
    "referenceSolutions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'eligible',
    "validatedAt" TIMESTAMPTZ(6) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_exams" (
    "examDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "opensAt" TIMESTAMPTZ(6) NOT NULL,
    "closesAt" TIMESTAMPTZ(6) NOT NULL,
    "lateEntryUntil" TIMESTAMPTZ(6) NOT NULL,
    "resultsDueAt" TIMESTAMPTZ(6) NOT NULL,
    "publishAt" TIMESTAMPTZ(6) NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "scheduleVersion" TEXT NOT NULL,
    "problemId" UUID,
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "selection" JSONB,
    "openedAt" TIMESTAMPTZ(6),
    "gradingAt" TIMESTAMPTZ(6),
    "finalizingAt" TIMESTAMPTZ(6),
    "publishedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelReason" TEXT,
    "correctionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_exams_pkey" PRIMARY KEY ("examDate")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL,
    "examDate" DATE NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "admittedAt" TIMESTAMPTZ(6) NOT NULL,
    "preflight" JSONB,
    "source" TEXT,
    "submittedAt" TIMESTAMPTZ(6),
    "submissionKind" TEXT,
    "testsPassed" INTEGER,
    "testsTotal" INTEGER,
    "graderVersion" TEXT,
    "gradedAt" TIMESTAMPTZ(6),
    "failureCounts" JSONB,
    "correctnessScore" INTEGER,
    "speedScore" INTEGER,
    "codingScore" INTEGER,
    "deductions" INTEGER,
    "finalScore" INTEGER,
    "rank" INTEGER,
    "ranked" BOOLEAN,
    "assessment" JSONB,
    "assessmentStatus" TEXT NOT NULL DEFAULT 'pending',
    "attemptId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_autosaves" (
    "attemptId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "clientSeq" INTEGER NOT NULL,
    "savedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_autosaves_pkey" PRIMARY KEY ("attemptId")
);

-- CreateTable
CREATE TABLE "exam_integrity_events" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" TIMESTAMPTZ(6),
    "clientSeq" INTEGER NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "exam_integrity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_integrity_decisions" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "deductions" INTEGER NOT NULL,
    "flags" JSONB NOT NULL,
    "inputSummary" JSONB NOT NULL,
    "reason" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_integrity_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_challenges" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "decisionId" UUID,

    CONSTRAINT "exam_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_standings" (
    "id" UUID NOT NULL,
    "examDate" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "userId" UUID,
    "rank" INTEGER,
    "ranked" BOOLEAN NOT NULL,
    "displayName" TEXT,
    "codingScore" INTEGER NOT NULL,
    "deductions" INTEGER NOT NULL,
    "finalScore" INTEGER NOT NULL,
    "testsPassed" INTEGER NOT NULL,
    "testsTotal" INTEGER NOT NULL,
    "elapsedSeconds" INTEGER,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_jobs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "attemptId" UUID,
    "status" TEXT NOT NULL,
    "runAfter" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(6),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "exam_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_job_slots" (
    "slot" INTEGER NOT NULL,
    "leaseToken" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(6),
    "jobId" UUID,

    CONSTRAINT "exam_job_slots_pkey" PRIMARY KEY ("slot")
);

-- CreateTable
CREATE TABLE "exam_audit" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_problems_slug_key" ON "exam_problems"("slug");

-- CreateIndex
CREATE INDEX "exam_problems_status_idx" ON "exam_problems"("status");

-- CreateIndex
CREATE INDEX "daily_exams_status_idx" ON "daily_exams"("status");

-- CreateIndex
CREATE INDEX "daily_exams_problemId_examDate_idx" ON "daily_exams"("problemId", "examDate");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_attemptId_key" ON "exam_attempts"("attemptId");

-- CreateIndex
CREATE INDEX "exam_attempts_examDate_status_idx" ON "exam_attempts"("examDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_examDate_userId_key" ON "exam_attempts"("examDate", "userId");

-- CreateIndex
CREATE INDEX "exam_integrity_events_attemptId_receivedAt_idx" ON "exam_integrity_events"("attemptId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_integrity_events_attemptId_clientEventId_key" ON "exam_integrity_events"("attemptId", "clientEventId");

-- CreateIndex
CREATE INDEX "exam_integrity_decisions_attemptId_createdAt_idx" ON "exam_integrity_decisions"("attemptId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_challenges_attemptId_key" ON "exam_challenges"("attemptId");

-- CreateIndex
CREATE INDEX "exam_challenges_status_createdAt_idx" ON "exam_challenges"("status", "createdAt");

-- CreateIndex
CREATE INDEX "exam_standings_examDate_version_rank_idx" ON "exam_standings"("examDate", "version", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "exam_standings_examDate_version_userId_key" ON "exam_standings"("examDate", "version", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_jobs_idempotencyKey_key" ON "exam_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "exam_jobs_status_runAfter_idx" ON "exam_jobs"("status", "runAfter");

-- CreateIndex
CREATE INDEX "exam_jobs_examDate_type_status_idx" ON "exam_jobs"("examDate", "type", "status");

-- CreateIndex
CREATE INDEX "exam_audit_createdAt_idx" ON "exam_audit"("createdAt");

-- AddForeignKey
ALTER TABLE "daily_exams" ADD CONSTRAINT "daily_exams_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "exam_problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_examDate_fkey" FOREIGN KEY ("examDate") REFERENCES "daily_exams"("examDate") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_autosaves" ADD CONSTRAINT "exam_autosaves_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_integrity_events" ADD CONSTRAINT "exam_integrity_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_integrity_decisions" ADD CONSTRAINT "exam_integrity_decisions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_challenges" ADD CONSTRAINT "exam_challenges_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_standings" ADD CONSTRAINT "exam_standings_examDate_fkey" FOREIGN KEY ("examDate") REFERENCES "daily_exams"("examDate") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_standings" ADD CONSTRAINT "exam_standings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_jobs" ADD CONSTRAINT "exam_jobs_examDate_fkey" FOREIGN KEY ("examDate") REFERENCES "daily_exams"("examDate") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_jobs" ADD CONSTRAINT "exam_jobs_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
