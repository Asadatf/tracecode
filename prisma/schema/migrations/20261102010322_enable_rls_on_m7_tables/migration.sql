-- Enable Row Level Security on the M7.5 tables (prisma/schema/recommendations.prisma
-- and notifications.prisma) created by the previous migration. No policies, and
-- never FORCE: Prisma connects as the table owner and must stay exempt, while the
-- anon/authenticated roles the Data API would use get a deny-by-default lock
-- (docs/rules/auth.md). Hand-written on purpose — RLS is not expressible in the
-- Prisma schema (docs/rules/migrations.md) — ordered AFTER the CI-generated
-- CREATE TABLE migration, and checked by `pnpm check:rls` in CI.
ALTER TABLE "recommendation_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "learning_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
