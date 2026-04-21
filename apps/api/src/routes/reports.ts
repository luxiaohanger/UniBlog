import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { isUserAdmin } from '../lib/roles';
import { publicUserSelect, serializePublicUser } from '../lib/serializeUser';

export const reportsRouter = Router();

type ReqUser = { user?: { userId: string } };

const REASON_MAX = 200;
const REVIEWER_NOTE_MAX = 500;

type TargetType = 'post' | 'comment' | 'user';
type ReportStatus = 'open' | 'resolved' | 'rejected';

const VALID_TARGET_TYPES = new Set<TargetType>(['post', 'comment', 'user']);

const uploadsDir = path.resolve(__dirname, '../../uploads');

/** 与 posts.ts#unlinkStoredMediaFile 相同的安全删除；avoid import cycle 故内联 */
function unlinkStoredMediaFile(storedPath: string) {
  const rel = storedPath.replace(/^uploads\/?/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return;
  const abs = path.resolve(uploadsDir, rel);
  const relFromRoot = path.relative(uploadsDir, abs);
  if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) return;
  fs.unlink(abs, (err) => {
    const code = err && (err as NodeJS.ErrnoException).code;
    if (err && code !== 'ENOENT') console.error('unlink media failed', err);
  });
}

/** 计算目标对应的 targetUserId（帖子/评论 → 作者，user → 目标本人） */
async function resolveTargetUserId(targetType: TargetType, targetId: string): Promise<string | null> {
  if (targetType === 'post') {
    const row = await prisma.post.findUnique({ where: { id: targetId }, select: { authorId: true } });
    return row?.authorId ?? null;
  }
  if (targetType === 'comment') {
    const row = await prisma.comment.findUnique({ where: { id: targetId }, select: { authorId: true } });
    return row?.authorId ?? null;
  }
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  return user?.id ?? null;
}

function serializeReport(r: {
  id: string;
  reporterId: string;
  targetType: TargetType;
  targetId: string;
  targetUserId: string | null;
  reason: string;
  status: ReportStatus;
  reviewerId: string | null;
  reviewerNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  reporter?: { id: string; username: string; displayName: string | null; avatarPath: string | null } | null;
  targetUser?: { id: string; username: string; displayName: string | null; avatarPath: string | null } | null;
  reviewer?: { id: string; username: string; displayName: string | null; avatarPath: string | null } | null;
}) {
  return {
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    status: r.status,
    reviewerNote: r.reviewerNote,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
    reporter: r.reporter ? serializePublicUser(r.reporter) : { id: r.reporterId, username: '', displayName: null, avatarUrl: null },
    targetUser: r.targetUser ? serializePublicUser(r.targetUser) : null,
    reviewer: r.reviewer ? serializePublicUser(r.reviewer) : null,
  };
}

// ===== 创建举报 =====

reportsRouter.post('/reports', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body as { targetType?: unknown; targetId?: unknown; reason?: unknown };
    const targetType = String(body.targetType ?? '') as TargetType;
    const targetId = String(body.targetId ?? '').trim();
    const reason = String(body.reason ?? '').trim();

    if (!VALID_TARGET_TYPES.has(targetType)) return res.status(400).json({ error: 'invalid_target_type' });
    if (!targetId) return res.status(400).json({ error: 'missing_target_id' });
    if (!reason) return res.status(400).json({ error: 'missing_reason' });
    if (reason.length > REASON_MAX) return res.status(400).json({ error: 'reason_too_long' });

    const targetUserId = await resolveTargetUserId(targetType, targetId);
    if (!targetUserId) return res.status(404).json({ error: 'target_not_found' });
    if (targetUserId === user.userId) return res.status(400).json({ error: 'cannot_report_self' });

    // 同一举报人 + 同一目标仅允许一条 open 举报
    const existing = await prisma.report.findFirst({
      where: {
        reporterId: user.userId,
        targetType,
        targetId,
        status: 'open',
      },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'already_reported' });

    const created = await prisma.report.create({
      data: {
        reporterId: user.userId,
        targetType,
        targetId,
        targetUserId,
        reason,
      },
    });

    return res.status(201).json({
      report: {
        id: created.id,
        targetType: created.targetType,
        targetId: created.targetId,
        status: created.status,
        createdAt: created.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'create_report_failed' });
  }
});

// ===== 管理员：列表 & 审核 =====

reportsRouter.get('/admin/reports', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const admin = await isUserAdmin(user.userId);
    if (!admin) return res.status(403).json({ error: 'forbidden_admin_only' });

    const statusRaw = String((req.query as { status?: unknown } | undefined)?.status ?? 'open').trim() as ReportStatus | 'all';
    const whereStatus = statusRaw === 'all' ? undefined : (statusRaw as ReportStatus);
    if (statusRaw !== 'all' && !['open', 'resolved', 'rejected'].includes(statusRaw)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    const takeN = Math.max(1, Math.min(100, Number((req.query as { take?: unknown } | undefined)?.take ?? 50) || 50));

    const rows = await prisma.report.findMany({
      where: whereStatus ? { status: whereStatus } : undefined,
      orderBy: [{ createdAt: 'desc' }],
      take: takeN,
      include: {
        reporter: { select: publicUserSelect },
        targetUser: { select: publicUserSelect },
        reviewer: { select: publicUserSelect },
      },
    });

    // 补充目标快照，便于管理员快速判断（帖子正文摘要 / 评论正文 / 被举报用户名）
    const postIds = rows.filter((r) => r.targetType === 'post').map((r) => r.targetId);
    const commentIds = rows.filter((r) => r.targetType === 'comment').map((r) => r.targetId);
    const [posts, comments] = await Promise.all([
      postIds.length
        ? prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, content: true } })
        : Promise.resolve([]),
      commentIds.length
        ? prisma.comment.findMany({
            where: { id: { in: commentIds } },
            select: { id: true, content: true, postId: true },
          })
        : Promise.resolve([]),
    ]);
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const commentMap = new Map(comments.map((c) => [c.id, c]));

    const list = rows.map((r) => {
      const base = serializeReport(r);
      let snapshot: { kind: string; content?: string; postId?: string } | null = null;
      if (r.targetType === 'post') {
        const p = postMap.get(r.targetId);
        snapshot = p ? { kind: 'post', content: p.content } : { kind: 'post_deleted' };
      } else if (r.targetType === 'comment') {
        const c = commentMap.get(r.targetId);
        snapshot = c ? { kind: 'comment', content: c.content, postId: c.postId } : { kind: 'comment_deleted' };
      } else if (r.targetType === 'user') {
        snapshot = { kind: 'user' };
      }
      return { ...base, targetSnapshot: snapshot };
    });

    return res.json({ reports: list });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'list_reports_failed' });
  }
});

/**
 * 管理员审核举报：
 * - action=resolve：标记 resolved；post/comment 目标触发同步删除（与 DELETE /posts/:id 等效），
 *   并给被举报者下发 SystemNotification(`report_resolved`)。
 * - action=reject：仅更新状态，不触及目标。
 *
 * 同一目标的其它 open 举报也会随之被置为 resolved（帖子/评论删掉后，后续再审无意义）。
 */
reportsRouter.patch('/admin/reports/:reportId', requireAuth(), async (req, res) => {
  try {
    const user = (req as unknown as ReqUser).user;
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const admin = await isUserAdmin(user.userId);
    if (!admin) return res.status(403).json({ error: 'forbidden_admin_only' });

    const { reportId } = req.params;
    const body = req.body as { action?: unknown; note?: unknown };
    const action = String(body.action ?? '');
    const note = body.note == null ? null : String(body.note).trim();
    if (action !== 'resolve' && action !== 'reject') {
      return res.status(400).json({ error: 'invalid_action' });
    }
    if (note && note.length > REVIEWER_NOTE_MAX) {
      return res.status(400).json({ error: 'reviewer_note_too_long' });
    }

    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) return res.status(404).json({ error: 'report_not_found' });
    if (report.status !== 'open') return res.status(409).json({ error: 'report_not_open' });

    const now = new Date();

    if (action === 'reject') {
      const updated = await prisma.report.update({
        where: { id: reportId },
        data: { status: 'rejected', reviewerId: user.userId, reviewerNote: note, reviewedAt: now },
        include: {
          reporter: { select: publicUserSelect },
          targetUser: { select: publicUserSelect },
          reviewer: { select: publicUserSelect },
        },
      });
      return res.json({ report: serializeReport(updated) });
    }

    // resolve：按目标类型联动处置
    if (report.targetType === 'post') {
      const post = await prisma.post.findUnique({
        where: { id: report.targetId },
        include: { media: true },
      });
      if (post) {
        const mediaPaths = post.media.map((m) => m.path);
        const postPreview = String(post.content || '').split('\n')[0]?.trim() || '';
        await prisma.post.delete({ where: { id: post.id } });
        await prisma.systemNotification.deleteMany({ where: { postId: post.id } });
        if (post.authorId !== user.userId) {
          await prisma.systemNotification.create({
            data: {
              recipientId: post.authorId,
              actorId: user.userId,
              kind: 'report_resolved',
              content: postPreview,
              postId: post.id,
            },
          });
        }
        for (const p of mediaPaths) unlinkStoredMediaFile(p);
      }
      // 同目标其它 open 举报联动关闭
      await prisma.report.updateMany({
        where: { targetType: 'post', targetId: report.targetId, status: 'open', NOT: { id: reportId } },
        data: {
          status: 'resolved',
          reviewerId: user.userId,
          reviewerNote: note,
          reviewedAt: now,
        },
      });
    } else if (report.targetType === 'comment') {
      const comment = await prisma.comment.findUnique({ where: { id: report.targetId } });
      if (comment) {
        // 若目标是「层主评论」，需连同同层回复一起删除；否则 Prisma 的 SetNull
        // 会让回复 layerMainId 变成 null，前端回退到 @用户名 启发式，极易错位。
        const isLayerRoot = comment.layerMainId == null;
        const layerReplies = isLayerRoot
          ? await prisma.comment.findMany({
              where: { layerMainId: comment.id },
              select: { id: true, authorId: true, content: true, postId: true },
            })
          : [];

        const idsToDelete = [comment.id, ...layerReplies.map((r) => r.id)];
        await prisma.comment.deleteMany({ where: { id: { in: idsToDelete } } });
        await prisma.systemNotification.deleteMany({ where: { commentId: { in: idsToDelete } } });

        // 给层主作者发通知
        if (comment.authorId !== user.userId) {
          await prisma.systemNotification.create({
            data: {
              recipientId: comment.authorId,
              actorId: user.userId,
              kind: 'report_resolved',
              content: String(comment.content || '').split('\n')[0]?.trim() || '',
              postId: comment.postId,
              commentId: comment.id,
            },
          });
        }
        // 同层回复作者也需知悉本条已被管理员删除（按作者去重）
        const notifiedReplyAuthors = new Set<string>();
        for (const r of layerReplies) {
          if (r.authorId === user.userId) continue;
          if (r.authorId === comment.authorId) continue;
          if (notifiedReplyAuthors.has(r.authorId)) continue;
          notifiedReplyAuthors.add(r.authorId);
          await prisma.systemNotification.create({
            data: {
              recipientId: r.authorId,
              actorId: user.userId,
              kind: 'comment_deleted_by_admin',
              content: String(r.content || '').split('\n')[0]?.trim() || '',
              postId: r.postId,
              commentId: r.id,
            },
          });
        }
      }
      await prisma.report.updateMany({
        where: { targetType: 'comment', targetId: report.targetId, status: 'open', NOT: { id: reportId } },
        data: {
          status: 'resolved',
          reviewerId: user.userId,
          reviewerNote: note,
          reviewedAt: now,
        },
      });
    }
    // targetType=user：不自动操作，仅标记 resolved，管理员在其它入口手动处置

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'resolved',
        reviewerId: user.userId,
        reviewerNote: note,
        reviewedAt: now,
      },
      include: {
        reporter: { select: publicUserSelect },
        targetUser: { select: publicUserSelect },
        reviewer: { select: publicUserSelect },
      },
    });

    return res.json({ report: serializeReport(updated) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'review_report_failed' });
  }
});
