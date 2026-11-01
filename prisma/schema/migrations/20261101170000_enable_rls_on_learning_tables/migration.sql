-- Enable Row Level Security on the learning tables (prisma/schema/learning.prisma)
-- created by the previous migration. No policies, and never FORCE: Prisma
-- connects as the owner and must stay exempt (docs/rules/auth.md). Hand-written
-- on purpose — RLS is not expressible in the Prisma schema
-- (docs/rules/migrations.md) — and checked by `pnpm check:rls` in CI.
ALTER TABLE "attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attempt_test_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "replay_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "problem_progress" ENABLE ROW LEVEL SECURITY;
