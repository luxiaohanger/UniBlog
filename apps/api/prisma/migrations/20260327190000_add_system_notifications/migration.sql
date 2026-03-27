-- CreateTable
CREATE TABLE "SystemNotification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "kind" TEXT NOT NULL,
  "content" TEXT,
  "postId" TEXT,
  "commentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SystemNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemNotification_recipientId_createdAt_idx" ON "SystemNotification"("recipientId", "createdAt");
CREATE INDEX "SystemNotification_postId_idx" ON "SystemNotification"("postId");
CREATE INDEX "SystemNotification_commentId_idx" ON "SystemNotification"("commentId");

-- AddForeignKey
ALTER TABLE "SystemNotification"
ADD CONSTRAINT "SystemNotification_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SystemNotification"
ADD CONSTRAINT "SystemNotification_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

