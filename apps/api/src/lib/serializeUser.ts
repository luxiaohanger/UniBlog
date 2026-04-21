/**
 * 统一的「用户公开信息」序列化：供 author / recipient / actor / sender 等字段复用。
 *
 * - avatarUrl：由后端基于 avatarPath 拼接出 `/` 前缀的相对 URL（如 `/uploads/avatar-xxx.jpg`）；
 *   前端再与 API_BASE_URL 拼接即可访问。为空时由前端回退到「首字母圆形」占位。
 * - displayName：为空时前端回退到 username，保持旧 UI 不退化。
 */

export type PublicUserInput = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarPath?: string | null;
  bio?: string | null;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio?: string | null;
};

/** Prisma `select` 片段：所有公开用户查询复用这一份，避免 avatar/displayName 回填遗漏 */
export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarPath: true,
} as const;

/** 附带简介版本（用户主页 / 编辑资料等场景） */
export const publicUserWithBioSelect = {
  ...publicUserSelect,
  bio: true,
} as const;

export function serializePublicUser(user: PublicUserInput): PublicUser {
  const avatarUrl = user.avatarPath ? `/${user.avatarPath.replace(/^\/+/, '')}` : null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? null,
    avatarUrl,
    ...(user.bio !== undefined ? { bio: user.bio ?? null } : {}),
  };
}
