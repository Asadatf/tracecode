-- Enable Row Level Security on the M10 Daily Exam tables (prisma/schema/exams.prisma) created by
-- the previous migration. No policies, and never FORCE: Prisma connects as the table owner and
-- must stay exempt, while the anon/authenticated roles the Data API would use get a
-- deny-by-default lock (docs/rules/auth.md). Hand-written on purpose — RLS is not expressible in
-- the Prisma schema (docs/rules/migrations.md) — ordered AFTER the generated CREATE TABLE
-- migration, and checked by `pnpm check:rls` in CI.
ALTER TABLE "exam_problems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_autosaves" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_integrity_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_integrity_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_standings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_job_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_audit" ENABLE ROW LEVEL SECURITY;
