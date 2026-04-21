'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { apiFetch } from '../../../lib/http';
import { getTokens } from '../../../lib/token';
import Avatar from '../../../components/Avatar';
import Modal from '../../../components/Modal';

type PublicUser = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

type TargetSnapshot =
  | { kind: 'post'; content: string }
  | { kind: 'post_deleted' }
  | { kind: 'comment'; content: string; postId: string }
  | { kind: 'comment_deleted' }
  | { kind: 'user' }
  | null;

type Report = {
  id: string;
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason: string;
  status: 'open' | 'resolved' | 'rejected';
  reviewerNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reporter: PublicUser;
  targetUser: PublicUser | null;
  reviewer: PublicUser | null;
  targetSnapshot: TargetSnapshot;
};

type ReportsRes = { reports: Report[] };

const STATUS_TABS: Array<{ value: 'open' | 'resolved' | 'rejected' | 'all'; label: string }> = [
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'all', label: '全部' },
];

const TARGET_LABEL: Record<Report['targetType'], string> = {
  post: '帖子',
  comment: '评论',
  user: '用户',
};

const STATUS_LABEL: Record<Report['status'], string> = {
  open: '待处理',
  resolved: '已通过',
  rejected: '已驳回',
};

const STATUS_COLOR: Record<Report['status'], string> = {
  open: 'var(--warn)',
  resolved: 'var(--success)',
  rejected: 'var(--fg-muted)',
};

function formatTime(iso: string | null | undefined) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function UserLine({ user, fallback }: { user: PublicUser | null; fallback?: string }) {
  if (!user) return <span style={{ color: 'var(--fg-muted)' }}>{fallback || '—'}</span>;
  const name = user.displayName?.trim() || user.username;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Avatar
        avatarUrl={user.avatarUrl}
        username={user.username}
        displayName={user.displayName}
        size={22}
        fontSize={11}
      />
      <Link
        href={`/user/${user.id}`}
        prefetch={false}
        style={{ color: 'var(--fg)', textDecoration: 'none', fontWeight: 500 }}
      >
        {name}
      </Link>
      <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>@{user.username}</span>
    </span>
  );
}

function SnapshotBlock({ report }: { report: Report }) {
  const snap = report.targetSnapshot;
  if (!snap) return null;
  if (snap.kind === 'post') {
    return (
      <div style={{ fontSize: 13, color: 'var(--fg-secondary)', background: 'var(--surface-muted)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>
          帖子 ID：<code>{report.targetId}</code>
          {' · '}
          <Link href={`/circles?postId=${report.targetId}`} prefetch={false} style={{ color: 'var(--brand-500)' }}>
            查看详情 ↗
          </Link>
        </div>
        {snap.content || <em style={{ color: 'var(--fg-muted)' }}>（空内容）</em>}
      </div>
    );
  }
  if (snap.kind === 'post_deleted') {
    return <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>帖子已被删除（ID：{report.targetId}）</div>;
  }
  if (snap.kind === 'comment') {
    return (
      <div style={{ fontSize: 13, color: 'var(--fg-secondary)', background: 'var(--surface-muted)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>
          评论 ID：<code>{report.targetId}</code>
          {' · '}
          <Link href={`/circles?postId=${snap.postId}&commentId=${report.targetId}`} prefetch={false} style={{ color: 'var(--brand-500)' }}>
            跳转所在帖子 ↗
          </Link>
        </div>
        {snap.content || <em style={{ color: 'var(--fg-muted)' }}>（空内容）</em>}
      </div>
    );
  }
  if (snap.kind === 'comment_deleted') {
    return <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>评论已被删除（ID：{report.targetId}）</div>;
  }
  // user
  return (
    <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
      <Link href={`/user/${report.targetId}`} prefetch={false} style={{ color: 'var(--brand-500)' }}>
        查看用户主页 ↗
      </Link>
    </div>
  );
}

type ActionState = {
  reportId: string;
  action: 'resolve' | 'reject';
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'open' | 'resolved' | 'rejected' | 'all'>('open');
  const [action, setAction] = useState<ActionState | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getTokens()?.accessToken;
    if (!token) {
      router.replace('/login');
      return;
    }
    setAuthed(true);
    apiFetch<{ user: { role?: string } }>('/auth/me')
      .then((r) => {
        setIsAdmin(r.user?.role === 'admin');
      })
      .catch(() => setIsAdmin(false));
  }, [router]);

  const swrKey = useMemo(
    () => (authed && isAdmin ? `/social/admin/reports?status=${status}&take=100` : null),
    [authed, isAdmin, status]
  );
  const { data, mutate, isLoading } = useSWR<ReportsRes>(swrKey, (key: string) =>
    apiFetch<ReportsRes>(key.replace('__list', ''))
  );

  const reports = data?.reports ?? [];

  const handleReview = async () => {
    if (!action) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/social/admin/reports/${action.reportId}`, {
        method: 'PATCH',
        body: { action: action.action, note: note.trim() || undefined },
      });
      setAction(null);
      setNote('');
      mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'review_failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (isAdmin === null && authed) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-muted)' }}>校验权限中…</div>;
  }
  if (isAdmin === false) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 16, marginBottom: 8 }}>仅管理员可访问本页面</div>
        <Link href="/" style={{ color: 'var(--brand-500)' }}>
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>举报审核</h1>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
            审核通过后，帖子 / 评论会被同步删除，并向作者发送系统通知。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border)',
                background: status === tab.value ? 'var(--brand-500)' : '#fff',
                color: status === tab.value ? '#fff' : 'var(--fg)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-muted)' }}>加载中…</div>
      ) : reports.length === 0 ? (
        <div
          className="card"
          style={{ padding: 48, textAlign: 'center', color: 'var(--fg-muted)', borderRadius: 'var(--radius-lg)' }}
        >
          暂无举报
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reports.map((r) => (
            <div
              key={r.id}
              className="card"
              style={{
                padding: 16,
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: '#fff',
                      background: STATUS_COLOR[r.status],
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--fg-secondary)',
                      background: 'var(--surface-muted)',
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {TARGET_LABEL[r.targetType]}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatTime(r.createdAt)}</span>
                </div>
                {r.status === 'open' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setAction({ reportId: r.id, action: 'resolve' });
                        setNote('');
                        setError(null);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-pill)',
                        border: 'none',
                        background: 'var(--danger)',
                        color: '#fff',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      通过并处置
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAction({ reportId: r.id, action: 'reject' });
                        setNote('');
                        setError(null);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid var(--border)',
                        background: '#fff',
                        color: 'var(--fg)',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      驳回
                    </button>
                  </div>
                ) : null}
              </div>

              <div style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'grid', gap: 4 }}>
                <div>
                  <strong style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>举报人：</strong>{' '}
                  <UserLine user={r.reporter} />
                </div>
                <div>
                  <strong style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>被举报用户：</strong>{' '}
                  <UserLine user={r.targetUser} fallback="（已无关联用户）" />
                </div>
                {r.reviewer ? (
                  <div>
                    <strong style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>审核人：</strong>{' '}
                    <UserLine user={r.reviewer} />
                    <span style={{ color: 'var(--fg-muted)', fontSize: 12, marginLeft: 8 }}>
                      {formatTime(r.reviewedAt)}
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>举报理由</div>
                <div
                  style={{
                    fontSize: 14,
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    whiteSpace: 'pre-wrap',
                    color: '#9a3412',
                  }}
                >
                  {r.reason}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>目标内容</div>
                <SnapshotBlock report={r} />
              </div>

              {r.reviewerNote ? (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>审核留言</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-secondary)', whiteSpace: 'pre-wrap' }}>
                    {r.reviewerNote}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!action}
        onClose={() => {
          if (!submitting) setAction(null);
        }}
        title={action?.action === 'resolve' ? '通过举报并处置' : '驳回举报'}
        description={
          action?.action === 'resolve'
            ? '通过后会同步删除被举报的帖子 / 评论（用户类举报仅标记为已处理），并向作者发送系统通知。'
            : '驳回后该举报关闭，不会对目标内容做任何处置。'
        }
        maxWidth={460}
        closeOnBackdrop={!submitting}
        footer={
          <>
            <button
              type="button"
              onClick={() => setAction(null)}
              disabled={submitting}
              className="btn-secondary"
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: '#fff',
                fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleReview}
              disabled={submitting}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: action?.action === 'resolve' ? 'var(--danger)' : 'var(--brand-500)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? '处理中…' : action?.action === 'resolve' ? '确认通过' : '确认驳回'}
            </button>
          </>
        }
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitting}
          rows={4}
          maxLength={500}
          placeholder="审核留言（可选，≤ 500 字）"
          style={{
            width: '100%',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            padding: '10px 12px',
            fontSize: 14,
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        {error ? (
          <div style={{ color: 'var(--danger)', fontSize: 12 }}>
            {error === 'report_not_open' ? '该举报已被处理' : error}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
