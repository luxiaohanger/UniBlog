-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- 用户名为 admin 的账号设为管理员
UPDATE "User" SET "role" = 'admin' WHERE "username" = 'admin';
