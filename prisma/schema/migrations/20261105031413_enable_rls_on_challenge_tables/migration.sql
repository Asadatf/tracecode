-- Enable Row Level Security on the M9B tables (prisma/schema/challenges.prisma) created by
-- the previous migration. No policies, and never FORCE: Prisma connects as the table
-- owner and must stay exempt, while the anon/authenticated roles the Data API would use
-- get a deny-by-default lock (docs/rules/auth.md). Hand-written on purpose — RLS is not
-- expressible in the Prisma schema (docs/rules/migrations.md) — ordered AFTER the
-- generated CREATE TABLE migration, and checked by `pnpm check:rls` in CI.
ALTER TABLE "daily_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "challenge_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_standings" ENABLE ROW LEVEL SECURITY;
