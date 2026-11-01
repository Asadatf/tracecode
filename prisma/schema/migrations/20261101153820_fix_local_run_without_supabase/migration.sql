-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "testsPassed" INTEGER NOT NULL,
    "testsTotal" INTEGER NOT NULL,
    "allPassed" BOOLEAN NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_test_results" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "testId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "expected" JSONB NOT NULL,
    "actual" JSONB,
    "errorType" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "attempt_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replay_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "testId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testPassed" BOOLEAN NOT NULL,

    CONSTRAINT "replay_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_events" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_progress" (
    "userId" UUID NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "bestTestsPassed" INTEGER NOT NULL DEFAULT 0,
    "testsTotal" INTEGER NOT NULL DEFAULT 0,
    "firstSolvedAt" TIMESTAMPTZ(6),
    "latestSolvedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_progress_pkey" PRIMARY KEY ("userId","problemSlug")
);

-- CreateIndex
CREATE INDEX "attempts_userId_problemSlug_idx" ON "attempts"("userId", "problemSlug");

-- CreateIndex
CREATE INDEX "attempt_test_results_attemptId_idx" ON "attempt_test_results"("attemptId");

-- CreateIndex
CREATE INDEX "replay_sessions_userId_idx" ON "replay_sessions"("userId");

-- CreateIndex
CREATE INDEX "replay_sessions_attemptId_idx" ON "replay_sessions"("attemptId");

-- CreateIndex
CREATE INDEX "learning_events_userId_problemSlug_idx" ON "learning_events"("userId", "problemSlug");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_test_results" ADD CONSTRAINT "attempt_test_results_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_sessions" ADD CONSTRAINT "replay_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replay_sessions" ADD CONSTRAINT "replay_sessions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_progress" ADD CONSTRAINT "problem_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
