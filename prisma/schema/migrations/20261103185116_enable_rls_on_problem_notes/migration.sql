-- Enable Row Level Security on problem_notes (prisma/schema/learning.prisma,
-- specs/features/problem-notes.md), created by the previous migration. No
-- policies, and never FORCE: Prisma connects as the table owner and must stay
-- exempt, while the anon/authenticated roles the Data API would use get a
-- deny-by-default lock (docs/rules/auth.md). Hand-written on purpose — RLS is
-- not expressible in the Prisma schema (docs/rules/migrations.md) — ordered
-- AFTER the CI-generated CREATE TABLE migration, and checked by `pnpm check:rls`.
ALTER TABLE "problem_notes" ENABLE ROW LEVEL SECURITY;
