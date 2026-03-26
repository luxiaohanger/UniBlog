-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "layerMainId" TEXT;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_layerMainId_fkey" FOREIGN KEY ("layerMainId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Comment_layerMainId_idx" ON "Comment"("layerMainId");
