-- AlterTable
ALTER TABLE "challenge_attempts" ADD COLUMN     "assessment" JSONB,
ADD COLUMN     "assessmentClaimedAt" TIMESTAMPTZ(6);

