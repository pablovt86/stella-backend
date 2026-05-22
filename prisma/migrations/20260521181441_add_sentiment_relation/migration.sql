-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SentimentAnalysis" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "sentiment_score" DOUBLE PRECISION NOT NULL,
    "sentiment_label" TEXT NOT NULL,
    "sentiment_mood" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "positive_words" INTEGER NOT NULL DEFAULT 0,
    "negative_words" INTEGER NOT NULL DEFAULT 0,
    "keywords" JSONB,
    "language" TEXT NOT NULL DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentimentAnalysis_conversationId_idx" ON "SentimentAnalysis"("conversationId");

-- CreateIndex
CREATE INDEX "SentimentAnalysis_sentiment_score_idx" ON "SentimentAnalysis"("sentiment_score");

-- CreateIndex
CREATE INDEX "SentimentAnalysis_severity_idx" ON "SentimentAnalysis"("severity");

-- CreateIndex
CREATE INDEX "SentimentAnalysis_createdAt_idx" ON "SentimentAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "SentimentAnalysis" ADD CONSTRAINT "SentimentAnalysis_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
