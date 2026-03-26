/**
 * 与圈子页一致：将帖子评论列表拆成主评论 / 回复并计算层号，供 UI 展示与回复挂接
 */
export function buildCommentTree(postComments: unknown[]) {
  const sortedComments = [...(postComments || [])].sort(
    (a: any, b: any) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const mainComments: any[] = [];
  const replyComments: any[] = [];

  sortedComments.forEach((comment: any) => {
    if (comment.content.includes('@') && comment.content.match(/@\w+/)) {
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
    const match = reply.content.match(/@(\w+)/);
    if (match) {
      const targetUsername = match[1];
      const targetMainComment = mainComments
        .filter((c: any) => c.author.username === targetUsername)
        .reverse()
        .find((c: any) => new Date(c.createdAt) < new Date(reply.createdAt));

      if (targetMainComment) {
        layers[reply.id] = layers[targetMainComment.id];
      } else {
        layers[reply.id] = 1;
      }
    } else {
      layers[reply.id] = 1;
    }
  });

  return { mainComments, replyComments, layers };
}
