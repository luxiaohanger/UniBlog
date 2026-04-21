import { Router } from 'express';
import { buildCommentTree } from '../lib/commentTree';
import { prisma } from '../lib/prisma';
import { isUserAdmin } from '../lib/roles';
import { requireAuth } from '../middleware/auth';
import { publicUserSelect, serializePublicUser } from '../lib/serializeUser';

export const socialRouter = Router();

type ReqUser = { user?: { userId: string } };

socialRouter.post('/posts/:postId/comments', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { content, layerMainId: bodyLayerMainId } = req.body as {
      content?: string;
      layerMainId?: string | null;
    };
    const text = String(content ?? '').trim();
    if (!text) return res.status(400).json({ error: 'missing_content' });

    let layerMainId: string | null = null;
    if (bodyLayerMainId != null && String(bodyLayerMainId).trim() !== '') {
      const root = await prisma.comment.findFirst({
        where: { id: bodyLayerMainId, postId, layerMainId: null },
      });
      if (!root) return res.status(400).json({ error: 'invalid_layer_main' });
      layerMainId = root.id;
    }

    const comment = await prisma.comment.create({
      data: { postId, authorId: user.userId, content: text, layerMainId },
      include: { author: { select: publicUserSelect } },
    });

    return res.status(201).json({
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        author: serializePublicUser(comment.author),
        layerMainId: comment.layerMainId,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'create_comment_failed' });
  }
});

/**
 * 删除「层主」及其同层回复（须放在 /comments/:commentId 之前，避免 layer 被当成 commentId）
 * 权限：仅管理员
 */
socialRouter.delete('/posts/:postId/comments/layer/:mainCommentId', requireAuth(), async (req, res) => {
  try {
    const { postId, mainCommentId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const admin = await isUserAdmin(user.userId);
    if (!admin) return res.status(403).json({ error: 'forbidden_admin_only' });

    const main = await prisma.comment.findUnique({ where: { id: mainCommentId } });
    if (!main || main.postId !== postId) {
      return res.status(404).json({ error: 'comment_not_found' });
    }

    const rows = await prisma.comment.findMany({
      where: { postId },
      include: { author: { select: publicUserSelect } },
      orderBy: { createdAt: 'asc' },
    });

    // 必须保留 layerMainId，否则 buildCommentTree 会退化为旧 @ 启发式，
    // 导致同层回复误判（例如新主评论文本含 @ 时被当成某层回复）
    const forTree = rows.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      author: serializePublicUser(c.author),
      layerMainId: c.layerMainId,
    }));

    const tree = buildCommentTree(forTree);
    const isLayerRoot = tree.mainComments.some((m: { id: string }) => m.id === mainCommentId);
    if (!isLayerRoot) {
      return res.status(400).json({ error: 'not_layer_root_comment' });
    }

    const layer = tree.layers[mainCommentId];
    const sameLayerReplyIds = tree.replyComments
      .filter((r: { id: string }) => tree.layers[r.id] === layer)
      .map((r: { id: string }) => r.id);

    const idsOrdered = [...sameLayerReplyIds, mainCommentId];

    const toDelete = await prisma.comment.findMany({
      where: { id: { in: idsOrdered } },
      select: { id: true, authorId: true, content: true, postId: true },
    });
    await prisma.comment.deleteMany({ where: { id: { in: idsOrdered } } });
    // 管理员删除层评论：仅通知被删除评论作者本人（不通知无关层主/他人）
    const byAuthor = new Map<string, { id: string; content: string; postId: string }>();
    for (const c of toDelete) {
      byAuthor.set(c.authorId, { id: c.id, content: c.content, postId: c.postId });
      await prisma.systemNotification.deleteMany({ where: { commentId: c.id } });
    }
    for (const [recipientId, c] of byAuthor.entries()) {
      if (recipientId === user.userId) continue;
      await prisma.systemNotification.create({
        data: {
          recipientId,
          actorId: user.userId,
          kind: 'comment_deleted_by_admin',
          content: String(c.content || '').split('\n')[0]?.trim() || '',
          postId: c.postId,
          commentId: c.id,
        },
      });
    }
    return res.json({ ok: true, deletedCount: idsOrdered.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'delete_comment_layer_failed' });
  }
});

/** 删除单条评论；仅管理员；仅删该条，不连带同层其它回复 */
socialRouter.delete('/posts/:postId/comments/:commentId', requireAuth(), async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const admin = await isUserAdmin(user.userId);
    if (!admin) return res.status(403).json({ error: 'forbidden_admin_only' });

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: 'comment_not_found' });
    if (comment.postId !== postId) return res.status(400).json({ error: 'comment_post_mismatch' });

    // 安全拦截：如果目标是「层主评论」（有同层回复），必须走 layer 端点整层删除。
    // 否则 Prisma 的 onDelete: SetNull 会把回复变成孤儿，前端回退到 @用户名 启发式
    // 可能将其错误归入其他层。
    if (comment.layerMainId == null) {
      const replyCount = await prisma.comment.count({ where: { layerMainId: commentId } });
      if (replyCount > 0) {
        return res.status(400).json({ error: 'comment_has_replies_use_layer_endpoint' });
      }
    }

    await prisma.comment.delete({ where: { id: commentId } });
    await prisma.systemNotification.deleteMany({ where: { commentId } });
    // 管理员删除单条评论：仅通知被删除者本人
    if (comment.authorId !== user.userId) {
      await prisma.systemNotification.create({
        data: {
          recipientId: comment.authorId,
          actorId: user.userId,
          kind: 'comment_deleted_by_admin',
          content: String(comment.content || '').split('\n')[0]?.trim() || '',
          postId,
          commentId,
        },
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'delete_comment_failed' });
  }
});

socialRouter.post('/posts/:postId/likes', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postLike.upsert({
      where: { postId_userId: { postId, userId: user.userId } },
      update: {},
      create: { postId, userId: user.userId },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'like_failed' });
  }
});

socialRouter.delete('/posts/:postId/likes', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postLike.deleteMany({ where: { postId, userId: user.userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'unlike_failed' });
  }
});

socialRouter.post('/posts/:postId/favorites', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postFavorite.upsert({
      where: { postId_userId: { postId, userId: user.userId } },
      update: {},
      create: { postId, userId: user.userId },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'favorite_failed' });
  }
});

socialRouter.delete('/posts/:postId/favorites', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postFavorite.deleteMany({ where: { postId, userId: user.userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'unfavorite_failed' });
  }
});

// 获取当前用户对某个帖子的状态（点赞/收藏/转发）
socialRouter.get('/posts/:postId/states', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const [like, favorite, share] = await Promise.all([
      prisma.postLike.findUnique({ where: { postId_userId: { postId, userId: user.userId } } }),
      prisma.postFavorite.findUnique({ where: { postId_userId: { postId, userId: user.userId } } }),
      prisma.postShare.findUnique({ where: { postId_sharerId: { postId, sharerId: user.userId } } }),
    ]);

    return res.json({ liked: !!like, favorited: !!favorite, shared: !!share });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'reaction_states_failed' });
  }
});

socialRouter.post('/posts/:postId/share', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postShare.upsert({
      where: { postId_sharerId: { postId, sharerId: user.userId } },
      update: {},
      create: { postId, sharerId: user.userId },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'share_failed' });
  }
});

socialRouter.delete('/posts/:postId/share', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postShare.deleteMany({ where: { postId, sharerId: user.userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'unshare_failed' });
  }
});

// ===== 好友关系（Friendship）=====

type FriendshipAction = 'ACCEPTED' | 'DECLINED';

function friendshipBetween(userAId: string, userBId: string) {
  return {
    OR: [
      { senderId: userAId, receiverId: userBId },
      { senderId: userBId, receiverId: userAId },
    ],
  };
}

/**
 * 关系状态查询（供前端按钮用）
 * - FRIENDS: 已是好友
 * - PENDING: 我已发出申请（等待对方处理）
 * - INCOMING: 对方发来申请（等待我处理）
 * - NONE: 无关系
 */
socialRouter.get('/friends/relationship/:userId', requireAuth(), async (req, res) => {
  try {
    const targetUserId = String(req.params.userId || '').trim();
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!targetUserId) return res.status(400).json({ error: 'missing_user_id' });
    if (targetUserId === user.userId) return res.json({ relationship: { kind: 'SELF' } });

    const row = await prisma.friendship.findFirst({
      where: friendshipBetween(user.userId, targetUserId),
      orderBy: { createdAt: 'desc' },
    });

    if (!row) return res.json({ relationship: { kind: 'NONE' } });
    if (row.status === 'ACCEPTED') return res.json({ relationship: { kind: 'FRIENDS' } });
    if (row.status === 'PENDING') {
      if (row.senderId === user.userId) {
        return res.json({ relationship: { kind: 'PENDING', requestId: row.id } });
      }
      return res.json({ relationship: { kind: 'INCOMING', requestId: row.id } });
    }
    return res.json({ relationship: { kind: 'NONE' } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'friend_relationship_failed' });
  }
});

// 发送好友申请
socialRouter.post('/friends/request/:userId', requireAuth(), async (req, res) => {
  try {
    const receiverId = String(req.params.userId || '').trim();
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!receiverId) return res.status(400).json({ error: 'missing_user_id' });
    if (receiverId === user.userId) return res.status(400).json({ error: 'cannot_friend_self' });

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) return res.status(404).json({ error: 'user_not_found' });

    const existing = await prisma.friendship.findFirst({
      where: friendshipBetween(user.userId, receiverId),
      orderBy: { createdAt: 'desc' },
    });

    if (existing?.status === 'ACCEPTED') {
      return res.status(409).json({ error: 'already_friends' });
    }
    if (existing?.status === 'PENDING') {
      return res.status(409).json({
        error: existing.senderId === user.userId ? 'request_already_sent' : 'request_already_received',
      });
    }

    if (existing && existing.status === 'DECLINED') {
      const updated = await prisma.friendship.update({
        where: { id: existing.id },
        data: { senderId: user.userId, receiverId, status: 'PENDING' },
      });
      return res.status(201).json({ request: { id: updated.id, status: updated.status, createdAt: updated.createdAt } });
    }

    const created = await prisma.friendship.create({
      data: { senderId: user.userId, receiverId, status: 'PENDING' },
    });
    return res.status(201).json({ request: { id: created.id, status: created.status, createdAt: created.createdAt } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'friend_request_failed' });
  }
});

// 获取当前用户收到的待处理申请
socialRouter.get('/friends/requests/pending', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const rows = await prisma.friendship.findMany({
      where: { receiverId: user.userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: publicUserSelect } },
      take: 50,
    });

    return res.json({
      requests: rows.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        sender: serializePublicUser(r.sender),
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'pending_requests_failed' });
  }
});

// 接受或拒绝申请（仅接收者可操作）
socialRouter.patch('/friends/request/:requestId', requireAuth(), async (req, res) => {
  try {
    const requestId = String(req.params.requestId || '').trim();
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!requestId) return res.status(400).json({ error: 'missing_request_id' });

    const status = String((req.body as { status?: string } | undefined)?.status || '').trim().toUpperCase();
    if (status !== 'ACCEPTED' && status !== 'DECLINED') {
      return res.status(400).json({ error: 'invalid_status' });
    }

    const row = await prisma.friendship.findUnique({ where: { id: requestId } });
    if (!row) return res.status(404).json({ error: 'request_not_found' });
    if (row.receiverId !== user.userId) return res.status(403).json({ error: 'forbidden' });
    if (row.status !== 'PENDING') return res.status(409).json({ error: 'request_not_pending' });

    const updated = await prisma.friendship.update({
      where: { id: requestId },
      data: { status: status as FriendshipAction },
    });

    return res.json({ request: { id: updated.id, status: updated.status, createdAt: updated.createdAt } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'update_request_failed' });
  }
});

// 获取联系人列表（好友 + 已解除但有关系记录的联系人）
socialRouter.get('/friends/list', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const rows = await prisma.friendship.findMany({
      where: {
        status: { in: ['ACCEPTED', 'DECLINED'] },
        OR: [{ senderId: user.userId }, { receiverId: user.userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: publicUserSelect },
        receiver: { select: publicUserSelect },
      },
      take: 200,
    });

    const friends = rows.map((r) => {
      const friend = r.senderId === user.userId ? r.receiver : r.sender;
      return {
        ...serializePublicUser(friend),
        relationStatus: r.status,
      };
    });
    return res.json({ friends });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'friend_list_failed' });
  }
});

// 删除好友（改为解除关系：ACCEPTED -> DECLINED，保留联系人与历史消息）
socialRouter.delete('/friends/:friendId', requireAuth(), async (req, res) => {
  try {
    const friendId = String(req.params.friendId || '').trim();
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!friendId) return res.status(400).json({ error: 'missing_friend_id' });
    if (friendId === user.userId) return res.status(400).json({ error: 'invalid_friend_id' });

    const rel = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: user.userId, receiverId: friendId },
          { senderId: friendId, receiverId: user.userId },
        ],
      },
      select: { id: true },
    });
    if (!rel) return res.status(404).json({ error: 'friendship_not_found' });

    await prisma.friendship.update({
      where: { id: rel.id },
      data: { status: 'DECLINED' },
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'delete_friend_failed' });
  }
});

// ===== 私信（ChatMessage）=====

// 获取与某好友的历史消息（双向）
socialRouter.get('/messages/:friendId', requireAuth(), async (req, res) => {
  try {
    const friendId = String(req.params.friendId || '').trim();
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!friendId) return res.status(400).json({ error: 'missing_friend_id' });
    if (friendId === user.userId) return res.status(400).json({ error: 'invalid_friend_id' });

    // 好友可读；非好友但存在历史消息也允许查看（只禁止继续发送）
    const rel = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: user.userId, receiverId: friendId },
          { senderId: friendId, receiverId: user.userId },
        ],
      },
    });
    if (!rel) {
      const historyCount = await prisma.chatMessage.count({
        where: {
          OR: [
            { senderId: user.userId, receiverId: friendId },
            { senderId: friendId, receiverId: user.userId },
          ],
        },
      });
      if (historyCount === 0) return res.status(403).json({ error: 'forbidden_not_friends' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: user.userId, receiverId: friendId },
          { senderId: friendId, receiverId: user.userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return res.json({
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        receiverId: m.receiverId,
        createdAt: m.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'messages_failed' });
  }
});

// 发送消息给好友
socialRouter.post('/messages/:friendId', requireAuth(), async (req, res) => {
  try {
    const friendId = String(req.params.friendId || '').trim();
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!friendId) return res.status(400).json({ error: 'missing_friend_id' });
    if (friendId === user.userId) return res.status(400).json({ error: 'invalid_friend_id' });

    const content = String((req.body as { content?: unknown } | undefined)?.content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'missing_content' });

    const rel = await prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: user.userId, receiverId: friendId },
          { senderId: friendId, receiverId: user.userId },
        ],
      },
    });
    if (!rel) return res.status(403).json({ error: 'forbidden_not_friends' });

    const msg = await prisma.chatMessage.create({
      data: { content, senderId: user.userId, receiverId: friendId },
    });

    return res.status(201).json({
      message: {
        id: msg.id,
        content: msg.content,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        createdAt: msg.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'send_message_failed' });
  }
});

// ===== 系统信息（通知）=====

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

socialRouter.get('/notifications', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const me = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, username: true },
    });
    if (!me) return res.status(401).json({ error: 'unauthorized' });
    const takeRaw = String((req.query as { take?: unknown } | undefined)?.take ?? '').trim();
    const takeN = Math.max(1, Math.min(50, Number(takeRaw || 50) || 50));

    // 1) 评论帖子：仅顶层评论提示帖主（回复不连带提示帖主）
    const postComments = await prisma.comment.findMany({
      where: {
        authorId: { not: user.userId },
        post: { authorId: user.userId },
        layerMainId: null,
      },
      orderBy: { createdAt: 'desc' },
      take: takeN,
      include: {
        author: { select: publicUserSelect },
        post: { select: { id: true, content: true } },
      },
    });

    // 2) 回复评论：只提示被回复目标用户（通过 @我的用户名 匹配）
    const mentionPrefix = `@${me.username}`;
    const commentReplies = await prisma.comment.findMany({
      where: {
        authorId: { not: user.userId },
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

    // 为“回复评论”找到被回复用户自己在同层的最近一条评论（用于引号内容）
    const layerMainIds = Array.from(new Set(commentReplies.map((c) => String(c.layerMainId)).filter(Boolean)));
    const myLayerComments = layerMainIds.length
      ? await prisma.comment.findMany({
          where: {
            authorId: user.userId,
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
        // 回复层主时，目标评论就是层主评论本身
        const root = commentReplies.find((c) => c.layerMainId === reply.layerMainId)?.layerRoot;
        if (root && root.authorId === user.userId) return { id: root.id, content: root.content };
        return null;
      }
      const before = sameLayerMine.filter((c) => c.createdAt.getTime() <= reply.createdAt.getTime());
      const target = (before.length ? before : sameLayerMine)[(before.length ? before : sameLayerMine).length - 1];
      return target ? { id: target.id, content: target.content } : null;
    };

    // 3) 我发的帖被点赞/收藏
    const [likes, favorites] = await Promise.all([
      prisma.postLike.findMany({
        where: { userId: { not: user.userId }, post: { authorId: user.userId } },
        orderBy: { createdAt: 'desc' },
        take: takeN,
        include: { user: { select: publicUserSelect }, post: { select: { id: true, content: true } } },
      }),
      prisma.postFavorite.findMany({
        where: { userId: { not: user.userId }, post: { authorId: user.userId } },
        orderBy: { createdAt: 'desc' },
        take: takeN,
        include: { user: { select: publicUserSelect }, post: { select: { id: true, content: true } } },
      }),
    ]);
    const adminDeletes = await prisma.systemNotification.findMany({
      where: {
        recipientId: user.userId,
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

    return res.json({
      notifications: sliced.map((it) => ({
        ...it,
        createdAt: it.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'notifications_failed' });
  }
});

