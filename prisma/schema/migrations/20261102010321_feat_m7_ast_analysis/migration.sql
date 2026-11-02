-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" UUID NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailOptIn" BOOLEAN NOT NULL DEFAULT false,
    "cadence" TEXT NOT NULL DEFAULT 'daily',
    "unsubscribeToken" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "learning_notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "logicalKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "userId" UUID NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("userId","deliveryDate","channel")
);

-- CreateTable
CREATE TABLE "recommendation_cache" (
    "userId" UUID NOT NULL,
    "v" INTEGER NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "model" TEXT,
    "diagnosisSource" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshState" TEXT NOT NULL DEFAULT 'idle',
    "refreshClaimHash" TEXT,
    "refreshClaimedAt" TIMESTAMPTZ(6),
    "lastRefreshAt" TIMESTAMPTZ(6),

    CONSTRAINT "recommendation_cache_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_unsubscribeToken_key" ON "notification_preferences"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "learning_notifications_userId_createdAt_idx" ON "learning_notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "learning_notifications_userId_logicalKey_key" ON "learning_notifications"("userId", "logicalKey");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_notifications" ADD CONSTRAINT "learning_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_cache" ADD CONSTRAINT "recommendation_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
