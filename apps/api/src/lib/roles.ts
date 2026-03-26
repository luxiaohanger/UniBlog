import { prisma } from './prisma';

/** 是否为管理员（数据库 role === 'admin'） */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role === 'admin';
}
