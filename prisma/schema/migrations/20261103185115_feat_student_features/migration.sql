-- CreateTable
CREATE TABLE "problem_notes" (
    "userId" UUID NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_notes_pkey" PRIMARY KEY ("userId","problemSlug")
);

-- AddForeignKey
ALTER TABLE "problem_notes" ADD CONSTRAINT "problem_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
