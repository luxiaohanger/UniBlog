import { prisma } from '../lib/prisma';
import { isUserAdmin } from '../lib/roles';
import { publicUserSelect, serializePublicUser } from '../lib/serializeUser';
import { ServiceError } from '../lib/serviceError';
import { unlinkStoredMediaFile } from '../lib/uploads';

type TargetType = 'post' | 'comment' | 'user';
type ReportStatus = 'open' | 'resolved' | 'rejected';

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
    reporter: r.reporter
      ? serializePublicUser(r.reporter)
      : { id: r.reporterId, username: '', displayName: null, avatarUrl: null },
    targetUser: r.targetUser ? serializePublicUser(r.targetUser) : null,
    reviewer: r.reviewer ? serializePublicUser(r.reviewer) : null,
  };
}

export async function createReport(
  reporterId: string,
  input: { targetType: TargetType; targetId: string; reason: string }
) {
  const { targetType, targetId, reason } = input;

  const targetUserId = await resolveTargetUserId(targetType, targetId);
  if (!targetUserId) throw new ServiceError(404, 'target_not_found');
  if (targetUserId === reporterId) throw new ServiceError(400, 'cannot_report_self');

  const existing = await prisma.report.findFirst({
    where: {
      reporterId,
      targetType,
      targetId,
      status: 'open',
    },
    select: { id: true },
  });
  if (existing) throw new ServiceError(409, 'already_reported');

  const created = await prisma.report.create({
    data: {
      reporterId,
      targetType,
      targetId,
      targetUserId,
      reason,
    },
  });

  return {
    report: {
      id: created.id,
      targetType: created.targetType,
      targetId: created.targetId,
      status: created.status,
      createdAt: created.createdAt,
    },
  };
}

export async function listAdminReports(adminUserId: string, query: { status?: string; take?: number }) {
  const admin = await isUserAdmin(adminUserId);
  if (!admin) throw new ServiceError(403, 'forbidden_admin_only');

  const statusRaw = String(query.status ?? 'open').trim() as ReportStatus | 'all';
  const whereStatus = statusRaw === 'all' ? undefined : (statusRaw as ReportStatus);
  if (statusRaw !== 'all' && !['open', 'resolved', 'rejected'].includes(statusRaw)) {
    throw new ServiceError(400, 'invalid_status');
  }
  const takeN = Math.max(1, Math.min(100, Number(query.take ?? 50) || 50));

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

  return { reports: list };
}

export async function reviewReport(
  adminUserId: string,
  reportId: string,
  input: { action: 'resolve' | 'reject'; note: string | null }
) {
  const admin = await isUserAdmin(adminUserId);
  if (!admin) throw new ServiceError(403, 'forbidden_admin_only');

  const { action, note } = input;

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new ServiceError(404, 'report_not_found');
  if (report.status !== 'open') throw new ServiceError(409, 'report_not_open');

  const now = new Date();

  if (action === 'reject') {
    const updated = await prisma.report.update({
      where: { id: reportId },
      data: { status: 'rejected', reviewerId: adminUserId, reviewerNote: note, reviewedAt: now },
      include: {
        reporter: { select: publicUserSelect },
        targetUser: { select: publicUserSelect },
        reviewer: { select: publicUserSelect },
      },
    });
    return { report: serializeReport(updated) };
  }

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
      if (post.authorId !== adminUserId) {
        await prisma.systemNotification.create({
          data: {
            recipientId: post.authorId,
            actorId: adminUserId,
            kind: 'report_resolved',
            content: postPreview,
            postId: post.id,
          },
        });
      }
      for (const p of mediaPaths) unlinkStoredMediaFile(p);
    }
    await prisma.report.updateMany({
      where: { targetType: 'post', targetId: report.targetId, status: 'open', NOT: { id: reportId } },
      data: {
        status: 'resolved',
        reviewerId: adminUserId,
        reviewerNote: note,
        reviewedAt: now,
      },
    });
  } else if (report.targetType === 'comment') {
    const comment = await prisma.comment.findUnique({ where: { id: report.targetId } });
    if (comment) {
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

      if (comment.authorId !== adminUserId) {
        await prisma.systemNotification.create({
          data: {
            recipientId: comment.authorId,
            actorId: adminUserId,
            kind: 'report_resolved',
            content: String(comment.content || '').split('\n')[0]?.trim() || '',
            postId: comment.postId,
            commentId: comment.id,
          },
        });
      }
      const notifiedReplyAuthors = new Set<string>();
      for (const r of layerReplies) {
        if (r.authorId === adminUserId) continue;
        if (r.authorId === comment.authorId) continue;
        if (notifiedReplyAuthors.has(r.authorId)) continue;
        notifiedReplyAuthors.add(r.authorId);
        await prisma.systemNotification.create({
          data: {
            recipientId: r.authorId,
            actorId: adminUserId,
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
        reviewerId: adminUserId,
        reviewerNote: note,
        reviewedAt: now,
      },
    });
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: 'resolved',
      reviewerId: adminUserId,
      reviewerNote: note,
      reviewedAt: now,
    },
    include: {
      reporter: { select: publicUserSelect },
      targetUser: { select: publicUserSelect },
      reviewer: { select: publicUserSelect },
    },
  });

  return { report: serializeReport(updated) };
}
