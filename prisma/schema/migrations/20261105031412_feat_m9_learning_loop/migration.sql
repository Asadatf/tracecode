-- AlterTable
ALTER TABLE "users" ADD COLUMN     "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "daily_challenges" (
    "challengeDate" DATE NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_challenges_pkey" PRIMARY KEY ("challengeDate")
);

-- CreateTable
CREATE TABLE "challenge_attempts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "challengeDate" DATE NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL,
    "deadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT,
    "submittedAt" TIMESTAMPTZ(6),
    "elapsedMs" INTEGER,
    "gradingClaimedAt" TIMESTAMPTZ(6),
    "gradedAt" TIMESTAMPTZ(6),
    "testsPassed" INTEGER,
    "testsTotal" INTEGER,
    "score" INTEGER,
    "graderVersion" TEXT,
    "gradeError" TEXT,
    "weekStart" DATE NOT NULL,
    "attemptId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_standings" (
    "weekStart" DATE NOT NULL,
    "userId" UUID NOT NULL,
    "rank" INTEGER,
    "isPublic" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "daysSolved" INTEGER NOT NULL,
    "totalMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_standings_pkey" PRIMARY KEY ("weekStart","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "challenge_attempts_attemptId_key" ON "challenge_attempts"("attemptId");

-- CreateIndex
CREATE INDEX "challenge_attempts_weekStart_status_idx" ON "challenge_attempts"("weekStart", "status");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_attempts_userId_challengeDate_key" ON "challenge_attempts"("userId", "challengeDate");

-- CreateIndex
CREATE INDEX "weekly_standings_weekStart_isPublic_rank_idx" ON "weekly_standings"("weekStart", "isPublic", "rank");

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_challengeDate_fkey" FOREIGN KEY ("challengeDate") REFERENCES "daily_challenges"("challengeDate") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_standings" ADD CONSTRAINT "weekly_standings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

