/**
 * 评论树：层主 + 同层回复；新数据用 layerMainId，旧数据按正文开头 @用户名 推断
 */

/** 构建评论树所需的最小评论字段（兼容 API Prisma 与前端展示数据） */
export interface CommentTreeInput {
  id: string;
  content: string;
  createdAt: Date | string;
  layerMainId?: string | null;
  author: { username: string };
}

function assignLayerFromLegacyAt(
  reply: { id: string; content: string; createdAt: Date | string },
  mainComments: { id: string; author: { username: string }; createdAt: Date | string }[],
  layers: Record<string, number>
) {
  // 仅匹配开头的 @用户名，避免正文中随手 @ 造成误判
  const match = reply.content.match(/^\s*@(\w+)/);
  if (match) {
    const targetUsername = match[1];
    const candidates = mainComments.filter((c) => c.author.username === targetUsername);
    const before = candidates.filter(
      (c) => new Date(c.createdAt).getTime() < new Date(reply.createdAt).getTime()
    );
    const targetMainComment = before.length
      ? before.reduce((prev, cur) =>
          new Date(cur.createdAt).getTime() > new Date(prev.createdAt).getTime() ? cur : prev
        )
      : null;
    if (targetMainComment) {
      layers[reply.id] = layers[targetMainComment.id];
    } else {
      layers[reply.id] = 1;
    }
  } else {
    layers[reply.id] = 1;
  }
}

export function buildCommentTree<T extends CommentTreeInput>(postComments: T[] | null | undefined) {
  const sortedComments = [...(postComments || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const mainComments: T[] = [];
  const replyComments: T[] = [];

  sortedComments.forEach((comment) => {
    const hasLayerMain =
      comment.layerMainId != null && String(comment.layerMainId).length > 0;
    // 仅把「以 @用户名 开头」的旧评论识别为回复；避免新主评论里随意 @ 他人被误当成回复
    const legacyAtReply =
      !hasLayerMain && /^\s*@\w+/.test(String(comment.content ?? ''));
    if (hasLayerMain || legacyAtReply) {
      replyComments.push(comment);
    } else {
      mainComments.push(comment);
    }
  });

  const layers: Record<string, number> = {};

  mainComments.forEach((comment, index) => {
    layers[comment.id] = index + 1;
  });

  replyComments.forEach((reply) => {
    const hasLayerMain =
      reply.layerMainId != null && String(reply.layerMainId).length > 0;
    if (hasLayerMain && reply.layerMainId != null && layers[reply.layerMainId] != null) {
      layers[reply.id] = layers[reply.layerMainId];
    } else {
      assignLayerFromLegacyAt(reply, mainComments, layers);
    }
  });

  return { mainComments, replyComments, layers };
}
