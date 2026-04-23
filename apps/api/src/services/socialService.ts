import { buildCommentTree } from '@uniblog/shared';
import { prisma } from '../lib/prisma';
import { isUserAdmin } from '../lib/roles';
import { publicUserSelect, serializePublicUser } from '../lib/serializeUser';
import { ServiceError } from '../lib/serviceError';

type FriendshipAction = 'ACCEPTED' | 'DECLINED';

function friendshipBetween(userAId: string, userBId: string) {
  return {
    OR: [
      { senderId: userAId, receiverId: userBId },
      { senderId: userBId, receiverId: userAId },
    ],
  };
}

export async function createComment(
  userId: string,
  postId: string,
  input: { content: string; layerMainId?: string | null }
) {
  const text = input.content;
  let layerMainId: string | null = null;
  const raw = input.layerMainId;
  if (raw != null && String(raw).trim() !== '') {
    const root = await prisma.comment.findFirst({
      where: { id: String(raw).trim(), postId, layerMainId: null },
    });
    if (!root) throw new ServiceError(400, 'invalid_layer_main');
    layerMainId = root.id;
  }

  const comment = await prisma.comment.create({
    data: { postId, authorId: userId, content: text, layerMainId },
    include: { author: { select: publicUserSelect } },
  });

  return {
    comment: {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      author: serializePublicUser(comment.author),
      layerMainId: comment.layerMainId,
    },
  };
}

export async function deleteCommentLayer(userId: string, postId: string, mainCommentId: string) {
  const admin = await isUserAdmin(userId);
  if (!admin) throw new ServiceError(403, 'forbidden_admin_only');

  const main = await prisma.comment.findUnique({ where: { id: mainCommentId } });
  if (!main || main.postId !== postId) throw new ServiceError(404, 'comment_not_found');

  const rows = await prisma.comment.findMany({
    where: { postId },
    include: { author: { select: publicUserSelect } },
    orderBy: { createdAt: 'asc' },
  });

  const forTree = rows.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt,
    author: serializePublicUser(c.author),
    layerMainId: c.layerMainId,
  }));

  const tree = buildCommentTree(forTree);
  const isLayerRoot = tree.mainComments.some((m) => m.id === mainCommentId);
  if (!isLayerRoot) throw new ServiceError(400, 'not_layer_root_comment');

  const layer = tree.layers[mainCommentId];
  const sameLayerReplyIds = tree.replyComments
    .filter((r) => tree.layers[r.id] === layer)
    .map((r) => r.id);

  const idsOrdered = [...sameLayerReplyIds, mainCommentId];

  const toDelete = await prisma.comment.findMany({
    where: { id: { in: idsOrdered } },
    select: { id: true, authorId: true, content: true, postId: true },
  });
  await prisma.comment.deleteMany({ where: { id: { in: idsOrdered } } });
  const byAuthor = new Map<string, { id: string; content: string; postId: string }>();
  for (const c of toDelete) {
    byAuthor.set(c.authorId, { id: c.id, content: c.content, postId: c.postId });
    await prisma.systemNotification.deleteMany({ where: { commentId: c.id } });
  }
  for (const [recipientId, c] of byAuthor.entries()) {
    if (recipientId === userId) continue;
    await prisma.systemNotification.create({
      data: {
        recipientId,
        actorId: userId,
        kind: 'comment_deleted_by_admin',
        content: String(c.content || '').split('\n')[0]?.trim() || '',
        postId: c.postId,
        commentId: c.id,
      },
    });
  }
  return { ok: true as const, deletedCount: idsOrdered.length };
}

export async function deleteCommentAdmin(userId: string, postId: string, commentId: string) {
  const admin = await isUserAdmin(userId);
  if (!admin) throw new ServiceError(403, 'forbidden_admin_only');

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new ServiceError(404, 'comment_not_found');
  if (comment.postId !== postId) throw new ServiceError(400, 'comment_post_mismatch');

  if (comment.layerMainId == null) {
    const replyCount = await prisma.comment.count({ where: { layerMainId: commentId } });
    if (replyCount > 0) throw new ServiceError(400, 'comment_has_replies_use_layer_endpoint');
  }

  await prisma.comment.delete({ where: { id: commentId } });
  await prisma.systemNotification.deleteMany({ where: { commentId } });
  if (comment.authorId !== userId) {
    await prisma.systemNotification.create({
      data: {
        recipientId: comment.authorId,
        actorId: userId,
        kind: 'comment_deleted_by_admin',
        content: String(comment.content || '').split('\n')[0]?.trim() || '',
        postId,
        commentId,
      },
    });
  }
  return { ok: true as const };
}

export async function likePost(userId: string, postId: string) {
  await prisma.postLike.upsert({
    where: { postId_userId: { postId, userId } },
    update: {},
    create: { postId, userId },
  });
  return { ok: true as const };
}

export async function unlikePost(userId: string, postId: string) {
  await prisma.postLike.deleteMany({ where: { postId, userId } });
  return { ok: true as const };
}

export async function favoritePost(userId: string, postId: string) {
  await prisma.postFavorite.upsert({
    where: { postId_userId: { postId, userId } },
    update: {},
    create: { postId, userId },
  });
  return { ok: true as const };
}

export async function unfavoritePost(userId: string, postId: string) {
  await prisma.postFavorite.deleteMany({ where: { postId, userId } });
  return { ok: true as const };
}

export async function getPostStates(userId: string, postId: string) {
  const [like, favorite, share] = await Promise.all([
    prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } }),
    prisma.postFavorite.findUnique({ where: { postId_userId: { postId, userId } } }),
    prisma.postShare.findUnique({ where: { postId_sharerId: { postId, sharerId: userId } } }),
  ]);

  return { liked: !!like, favorited: !!favorite, shared: !!share };
}

export async function sharePost(userId: string, postId: string) {
  await prisma.postShare.upsert({
    where: { postId_sharerId: { postId, sharerId: userId } },
    update: {},
    create: { postId, sharerId: userId },
  });
  return { ok: true as const };
}

export async function unsharePost(userId: string, postId: string) {
  await prisma.postShare.deleteMany({ where: { postId, sharerId: userId } });
  return { ok: true as const };
}

export async function getFriendRelationship(userId: string, targetUserId: string) {
  if (!targetUserId) throw new ServiceError(400, 'missing_user_id');
  if (targetUserId === userId) return { relationship: { kind: 'SELF' as const } };

  const row = await prisma.friendship.findFirst({
    where: friendshipBetween(userId, targetUserId),
    orderBy: { createdAt: 'desc' },
  });

  if (!row) return { relationship: { kind: 'NONE' as const } };
  if (row.status === 'ACCEPTED') return { relationship: { kind: 'FRIENDS' as const } };
  if (row.status === 'PENDING') {
    if (row.senderId === userId) {
      return { relationship: { kind: 'PENDING' as const, requestId: row.id } };
    }
    return { relationship: { kind: 'INCOMING' as const, requestId: row.id } };
  }
  return { relationship: { kind: 'NONE' as const } };
}

export async function sendFriendRequest(userId: string, receiverId: string) {
  if (!receiverId) throw new ServiceError(400, 'missing_user_id');
  if (receiverId === userId) throw new ServiceError(400, 'cannot_friend_self');

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { id: true },
  });
  if (!receiver) throw new ServiceError(404, 'user_not_found');

  const existing = await prisma.friendship.findFirst({
    where: friendshipBetween(userId, receiverId),
    orderBy: { createdAt: 'desc' },
  });

  if (existing?.status === 'ACCEPTED') throw new ServiceError(409, 'already_friends');
  if (existing?.status === 'PENDING') {
    throw new ServiceError(
      409,
      existing.senderId === userId ? 'request_already_sent' : 'request_already_received'
    );
  }

  if (existing && existing.status === 'DECLINED') {
    const updated = await prisma.friendship.update({
      where: { id: existing.id },
      data: { senderId: userId, receiverId, status: 'PENDING' },
    });
    return {
      request: { id: updated.id, status: updated.status, createdAt: updated.createdAt },
    };
  }

  const created = await prisma.friendship.create({
    data: { senderId: userId, receiverId, status: 'PENDING' },
  });
  return {
    request: { id: created.id, status: created.status, createdAt: created.createdAt },
  };
}

export async function getPendingFriendRequests(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: { receiverId: userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: { sender: { select: publicUserSelect } },
    take: 50,
  });

  return {
    requests: rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      sender: serializePublicUser(r.sender),
    })),
  };
}

export async function patchFriendRequest(userId: string, requestId: string, status: FriendshipAction) {
  if (!requestId) throw new ServiceError(400, 'missing_request_id');

  const row = await prisma.friendship.findUnique({ where: { id: requestId } });
  if (!row) throw new ServiceError(404, 'request_not_found');
  if (row.receiverId !== userId) throw new ServiceError(403, 'forbidden');
  if (row.status !== 'PENDING') throw new ServiceError(409, 'request_not_pending');

  const updated = await prisma.friendship.update({
    where: { id: requestId },
    data: { status },
  });

  return { request: { id: updated.id, status: updated.status, createdAt: updated.createdAt } };
}

export async function getFriendList(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: { in: ['ACCEPTED', 'DECLINED'] },
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: publicUserSelect },
      receiver: { select: publicUserSelect },
    },
    take: 200,
  });

  const friends = rows.map((r) => {
    const friend = r.senderId === userId ? r.receiver : r.sender;
    return {
      ...serializePublicUser(friend),
      relationStatus: r.status,
    };
  });
  return { friends };
}

export async function deleteFriend(userId: string, friendId: string) {
  if (!friendId) throw new ServiceError(400, 'missing_friend_id');
  if (friendId === userId) throw new ServiceError(400, 'invalid_friend_id');

  const rel = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
    select: { id: true },
  });
  if (!rel) throw new ServiceError(404, 'friendship_not_found');

  await prisma.friendship.update({
    where: { id: rel.id },
    data: { status: 'DECLINED' },
  });
  return { ok: true as const };
}

export async function getMessages(userId: string, friendId: string) {
  if (!friendId) throw new ServiceError(400, 'missing_friend_id');
  if (friendId === userId) throw new ServiceError(400, 'invalid_friend_id');

  const rel = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
  });
  if (!rel) {
    const historyCount = await prisma.chatMessage.count({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });
    if (historyCount === 0) throw new ServiceError(403, 'forbidden_not_friends');
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  return {
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      receiverId: m.receiverId,
      createdAt: m.createdAt,
    })),
  };
}

export async function sendMessage(userId: string, friendId: string, content: string) {
  if (!friendId) throw new ServiceError(400, 'missing_friend_id');
  if (friendId === userId) throw new ServiceError(400, 'invalid_friend_id');

  const rel = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
  });
  if (!rel) throw new ServiceError(403, 'forbidden_not_friends');

  const msg = await prisma.chatMessage.create({
    data: { content, senderId: userId, receiverId: friendId },
  });

  return {
    message: {
      id: msg.id,
      content: msg.content,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      createdAt: msg.createdAt,
    },
  };
}

type ActorPublic = ReturnType<typeof serializePublicUser>;

type NotificationItem =
  | {
      kind: 'post_commented';
      createdAt: Date;
      actor: ActorPublic;
      post: { id: string; content: string };
      comment: { id: string; content: string };
    }
  | {
      kind: 'comment_replied';
      createdAt: Date;
      actor: ActorPublic;
      post: { id: string; content: string };
      comment: { id: string; content: string };
      targetComment: { id: string; content: string } | null;
      layerMainId: string;
    }
  | {
      kind: 'post_liked' | 'post_favorited';
      createdAt: Date;
      actor: ActorPublic;
      post: { id: string; content: string };
    }
  | {
      kind: 'post_deleted_by_admin' | 'comment_deleted_by_admin' | 'report_resolved';
      createdAt: Date;
      actor: ActorPublic | null;
      post: { id: string; content: string };
      comment?: { id: string; content: string };
    };

export async function getNotifications(userId: string, takeRaw?: number) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!me) throw new ServiceError(401, 'unauthorized');

  const takeN = Math.max(1, Math.min(50, Number(takeRaw ?? 50) || 50));

  const postComments = await prisma.comment.findMany({
    where: {
      authorId: { not: userId },
      post: { authorId: userId },
      layerMainId: null,
    },
    orderBy: { createdAt: 'desc' },
    take: takeN,
    include: {
      author: { select: publicUserSelect },
      post: { select: { id: true, content: true } },
    },
  });

  const mentionPrefix = `@${me.username}`;
  const commentReplies = await prisma.comment.findMany({
    where: {
      authorId: { not: userId },
      layerMainId: { not: null },
      content: { startsWith: mentionPrefix },
    },
    orderBy: { createdAt: 'desc' },
    take: takeN,
    include: {
      author: { select: publicUserSelect },
      post: { select: { id: true, content: true } },
      layerRoot: { select: { id: true, content: true, authorId: true } },
    },
  });

  const layerMainIds = Array.from(new Set(commentReplies.map((c) => String(c.layerMainId)).filter(Boolean)));
  const myLayerComments = layerMainIds.length
    ? await prisma.comment.findMany({
        where: {
          authorId: userId,
          layerMainId: { in: layerMainIds },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, content: true, createdAt: true, layerMainId: true },
      })
    : [];

  const findTargetComment = (reply: { createdAt: Date; layerMainId: string | null }) => {
    if (!reply.layerMainId) return null;
    const sameLayerMine = myLayerComments.filter((c) => c.layerMainId === reply.layerMainId);
    if (!sameLayerMine.length) {
      const root = commentReplies.find((c) => c.layerMainId === reply.layerMainId)?.layerRoot;
      if (root && root.authorId === userId) return { id: root.id, content: root.content };
      return null;
    }
    const before = sameLayerMine.filter((c) => c.createdAt.getTime() <= reply.createdAt.getTime());
    const target = (before.length ? before : sameLayerMine)[(before.length ? before : sameLayerMine).length - 1];
    return target ? { id: target.id, content: target.content } : null;
  };

  const [likes, favorites] = await Promise.all([
    prisma.postLike.findMany({
      where: { userId: { not: userId }, post: { authorId: userId } },
      orderBy: { createdAt: 'desc' },
      take: takeN,
      include: { user: { select: publicUserSelect }, post: { select: { id: true, content: true } } },
    }),
    prisma.postFavorite.findMany({
      where: { userId: { not: userId }, post: { authorId: userId } },
      orderBy: { createdAt: 'desc' },
      take: takeN,
      include: { user: { select: publicUserSelect }, post: { select: { id: true, content: true } } },
    }),
  ]);
  const adminDeletes = await prisma.systemNotification.findMany({
    where: {
      recipientId: userId,
      kind: { in: ['post_deleted_by_admin', 'comment_deleted_by_admin', 'report_resolved'] },
    },
    orderBy: { createdAt: 'desc' },
    take: takeN,
    include: { actor: { select: publicUserSelect } },
  });

  const items: NotificationItem[] = [
    ...postComments.map((c) => ({
      kind: 'post_commented' as const,
      createdAt: c.createdAt,
      actor: serializePublicUser(c.author),
      post: c.post,
      comment: { id: c.id, content: c.content },
    })),
    ...commentReplies.map((c) => ({
      kind: 'comment_replied' as const,
      createdAt: c.createdAt,
      actor: serializePublicUser(c.author),
      post: c.post,
      comment: { id: c.id, content: c.content },
      targetComment: findTargetComment(c),
      layerMainId: String(c.layerMainId),
    })),
    ...likes.map((l) => ({
      kind: 'post_liked' as const,
      createdAt: l.createdAt,
      actor: serializePublicUser(l.user),
      post: l.post,
    })),
    ...favorites.map((f) => ({
      kind: 'post_favorited' as const,
      createdAt: f.createdAt,
      actor: serializePublicUser(f.user),
      post: f.post,
    })),
    ...adminDeletes.map((n) => ({
      kind: n.kind as 'post_deleted_by_admin' | 'comment_deleted_by_admin' | 'report_resolved',
      createdAt: n.createdAt,
      actor: n.actor ? serializePublicUser(n.actor) : null,
      post: { id: n.postId || '', content: n.content || '' },
      comment:
        (n.kind === 'comment_deleted_by_admin' || n.kind === 'report_resolved') && n.commentId
          ? { id: n.commentId, content: n.content || '' }
          : undefined,
    })),
  ];

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const sliced = items.slice(0, takeN);

  return {
    notifications: sliced.map((it) => ({
      ...it,
      createdAt: it.createdAt,
    })),
  };
}
