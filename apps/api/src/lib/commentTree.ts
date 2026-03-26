/**
 * 与前端一致；新回复带 layerMainId，旧数据仍按 @ 推断
 */

function assignLayerFromLegacyAt(
  reply: { id: string; content: string; createdAt: Date },
  mainComments: { id: string; author: { username: string }; createdAt: Date }[],
  layers: Record<string, number>
) {
  const match = reply.content.match(/@(\w+)/);
  if (match) {
    const targetUsername = match[1];
    const candidates = mainComments.filter((c) => c.author.username === targetUsername);
    const before = candidates.filter((c) => new Date(c.createdAt) < new Date(reply.createdAt));
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
    const legacyAtReply =
      !hasLayerMain &&
      comment.content.includes('@') &&
      comment.content.match(/@\w+/);
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
