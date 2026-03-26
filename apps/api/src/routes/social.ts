import { Router } from 'express';
import { buildCommentTree } from '../lib/commentTree';
import { prisma } from '../lib/prisma';
import { isUserAdmin } from '../lib/roles';
import { requireAuth } from '../middleware/auth';

export const socialRouter = Router();

socialRouter.post('/posts/:postId/comments', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
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
      include: { author: { select: { id: true, username: true } } },
    });

    return res.status(201).json({
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        author: comment.author,
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
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const admin = await isUserAdmin(user.userId);
    if (!admin) return res.status(403).json({ error: 'forbidden_admin_only' });

    const main = await prisma.comment.findUnique({ where: { id: mainCommentId } });
    if (!main || main.postId !== postId) {
      return res.status(404).json({ error: 'comment_not_found' });
    }

    const rows = await prisma.comment.findMany({
      where: { postId },
      include: { author: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const forTree = rows.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      author: c.author,
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

    await prisma.comment.deleteMany({ where: { id: { in: idsOrdered } } });
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
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const admin = await isUserAdmin(user.userId);
    if (!admin) return res.status(403).json({ error: 'forbidden_admin_only' });

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: 'comment_not_found' });
    if (comment.postId !== postId) return res.status(400).json({ error: 'comment_post_mismatch' });

    await prisma.comment.delete({ where: { id: commentId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'delete_comment_failed' });
  }
});

socialRouter.post('/posts/:postId/likes', requireAuth(), async (req, res) => {
  try {
    const { postId } = req.params;
    const user = (req as unknown as { user?: { userId: string } }).user;
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
    const user = (req as unknown as { user?: { userId: string } }).user;
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
    const user = (req as unknown as { user?: { userId: string } }).user;
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
    const user = (req as unknown as { user?: { userId: string } }).user;
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
    const user = (req as unknown as { user?: { userId: string } }).user;
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
    const user = (req as unknown as { user?: { userId: string } }).user;
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
    const user = (req as unknown as { user?: { userId: string } }).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    await prisma.postShare.deleteMany({ where: { postId, sharerId: user.userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'unshare_failed' });
  }
});

