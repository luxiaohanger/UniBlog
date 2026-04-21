/**
 * 与圈子页一致：将帖子评论拆成主评论 / 回复并计算层号
 * - 新数据：用 layerMainId 绑定层主，避免同用户名多主评时 @ 匹配错误
 * - 旧数据：无 layerMainId 时仍按正文 @用户名 推断（兼容）
 */

function assignLayerFromLegacyAt(
  reply: { id: string; content: string; createdAt: Date },
  mainComments: { id: string; author: { username: string }; createdAt: Date }[],
  layers: Record<string, number>
) {
  // 仅匹配开头的 @用户名（前端发回复时固定以 @用户名 开头），避免正文中随手 @ 造成误判
  const match = reply.content.match(/^\s*@(\w+)/);
  if (match) {
    const targetUsername = match[1];
    const candidates = mainComments.filter((c) => c.author.username === targetUsername);
    const before = candidates.filter((c) => new Date(c.createdAt) < new Date(reply.createdAt));
    // 取时间上离回复最近、且早于回复的那条主评（比 reverse().find 更稳，但仍无法区分同用户多主评）
    const targetMainComment = before.length
      ? before.reduce((prev, cur) =>
          new Date(cur.createdAt) > new Date(prev.createdAt) ? cur : prev
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

export function buildCommentTree(postComments: unknown[]) {
  const sortedComments = [...(postComments || [])].sort(
    (a: any, b: any) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const mainComments: any[] = [];
  const replyComments: any[] = [];

  sortedComments.forEach((comment: any) => {
    const hasLayerMain =
      comment.layerMainId != null && String(comment.layerMainId).length > 0;
    // 只把「以 @用户名 开头」的旧评论识别为回复；避免新主评论里随意 @ 他人被误当成回复
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

  replyComments.forEach((reply: any) => {
    const hasLayerMain =
      reply.layerMainId != null && String(reply.layerMainId).length > 0;
    if (hasLayerMain && layers[reply.layerMainId] != null) {
      layers[reply.id] = layers[reply.layerMainId];
    } else {
      assignLayerFromLegacyAt(reply, mainComments, layers);
    }
  });

  return { mainComments, replyComments, layers };
}
