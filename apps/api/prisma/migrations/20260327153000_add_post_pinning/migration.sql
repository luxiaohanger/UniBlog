-- Add pinning fields for feed/profile pages
ALTER TABLE "Post"
ADD COLUMN "pinnedInFeedAt" TIMESTAMP(3),
ADD COLUMN "pinnedInProfileAt" TIMESTAMP(3);

CREATE INDEX "Post_pinnedInFeedAt_idx" ON "Post"("pinnedInFeedAt");
CREATE INDEX "Post_authorId_pinnedInProfileAt_idx" ON "Post"("authorId", "pinnedInProfileAt");
