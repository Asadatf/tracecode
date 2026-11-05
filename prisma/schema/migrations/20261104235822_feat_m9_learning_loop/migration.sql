-- CreateTable
CREATE TABLE "problem_reviews" (
    "userId" UUID NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "reviewsDone" INTEGER NOT NULL DEFAULT 0,
    "dueDay" DATE NOT NULL,
    "enrolledAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "remindedAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_reviews_pkey" PRIMARY KEY ("userId","problemSlug")
);

-- CreateIndex
CREATE INDEX "problem_reviews_dueDay_idx" ON "problem_reviews"("dueDay");

-- AddForeignKey
ALTER TABLE "problem_reviews" ADD CONSTRAINT "problem_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
