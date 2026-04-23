'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { apiFetch } from '@/features/client/http';
import {
  getTokens,
  clearTokens,
  getStoredDisplayUsername,
  setStoredDisplayUsername,
} from '@/features/client/token';
import {
  getLastSeenMap,
  getSystemReadKeySet,
  getUnreadMap,
  setUnread,
  subscribeUnreadChanged,
} from '../lib/unread';
import Modal from './Modal';

type Friend = { id: string; username: string; relationStatus: 'ACCEPTED' | 'DECLINED' };
type FriendsRes = { friends: Friend[] };
type MessagesRes = {
  messages: Array<{
    id: string;
    senderId: string;
    createdAt: string;
  }>;
};

function compareISO(a: string, b: string) {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function HeaderFriendUnreadWatcher(props: { friendId: string; accessToken: string | null }) {
  const { friendId, accessToken } = props;
  const key = accessToken ? `/social/messages/${friendId}__header_watch` : null;
  const { data } = useSWR<MessagesRes>(
    key,
    () => apiFetch<MessagesRes>(`/social/messages/${friendId}`),
    { refreshInterval: 3000, dedupingInterval: 800, refreshWhenHidden: true }
  );

  useEffect(() => {
    const last = data?.messages?.[data.messages.length - 1];
    if (!last) return;
    // 仅对方发来的新消息才标记为未读
    if (last.senderId !== friendId) return;
    const lastSeen = getLastSeenMap()[friendId] || '';
    const createdAt = String(last.createdAt);
    if (!lastSeen || compareISO(createdAt, lastSeen) > 0) {
      setUnread(friendId, createdAt);
    }
  }, [data?.messages?.length, friendId]);

  return null;
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const syncToken = () => setAccessToken(getTokens()?.accessToken || null);
    syncToken();
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncToken();
    };
    window.addEventListener('focus', syncToken);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', syncToken);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname]);

  const { data } = useSWR<{
    user: { id: string; email: string; username: string; displayName?: string | null; role?: string };
  }>(
    accessToken ? '/auth/me' : null,
    () =>
      apiFetch<{
        user: { id: string; email: string; username: string; displayName?: string | null; role?: string };
      }>('/auth/me')
  );
  const isAdmin = data?.user?.role === 'admin';

  useEffect(() => {
    const u = data?.user?.displayName?.trim() || data?.user?.username;
    if (u) setStoredDisplayUsername(u);
  }, [data?.user?.displayName, data?.user?.username]);

  const username =
    data?.user?.displayName?.trim() ||
    data?.user?.username ||
    getStoredDisplayUsername() ||
    undefined;
  // 以 token 为准：已登录在 /auth/me 返回前不再误显示「登录/注册」
  const isAuthed = !!accessToken;
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadTick, setUnreadTick] = useState(0);
  // 滚动超过阈值时给 header 加阴影
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    return subscribeUnreadChanged(() => setUnreadTick((v) => v + 1));
  }, []);

  const pendingKey = accessToken ? '/social/friends/requests/pending__header' : null;
  const { data: pendingData } = useSWR<{ requests: Array<{ id: string }> }>(
    pendingKey,
    () => apiFetch<{ requests: Array<{ id: string }> }>('/social/friends/requests/pending'),
    { refreshInterval: 2500, dedupingInterval: 800, refreshWhenHidden: true }
  );
  const hasPendingRequests = (pendingData?.requests?.length ?? 0) > 0;
  const friendsKey = accessToken ? '/social/friends/list__header' : null;
  const { data: friendsData } = useSWR<FriendsRes>(
    friendsKey,
    () => apiFetch<FriendsRes>('/social/friends/list'),
    { refreshInterval: 6000, dedupingInterval: 1200, refreshWhenHidden: true }
  );
  const friendIds = (friendsData?.friends ?? []).map((f) => f.id);

  // 顶栏直接轮询系统通知并按 read-key 判断未读，避免提示残留
  const notifKey = accessToken ? '/social/notifications?take=1__header' : null;
  const { data: notifData } = useSWR<{
    notifications: Array<{
      kind: string;
      createdAt: string;
      actor: { id: string };
      post: { id: string };
      comment?: { id: string };
    }>;
  }>(
    notifKey,
    () =>
      apiFetch<{
        notifications: Array<{
          kind: string;
          createdAt: string;
          actor: { id: string };
          post: { id: string };
          comment?: { id: string };
        }>;
      }>('/social/notifications?take=20'),
    { refreshInterval: 1500, dedupingInterval: 400, refreshWhenHidden: true }
  );

  const notifKeyOf = (it: {
    kind: string;
    createdAt: string;
    actor: { id: string };
    post: { id: string };
    comment?: { id: string };
  }) => `${it.kind}|${it.createdAt}|${it.actor.id}|${it.post.id}|${it.comment?.id ?? ''}`;

  const hasSystemUnreadByList = (() => {
    const list = notifData?.notifications ?? [];
    if (!list.length) return false;
    const readSet = getSystemReadKeySet();
    return list.some((it) => !readSet.has(notifKeyOf(it)));
  })();
  const unreadMap = getUnreadMap();
  const hasChatUnread = Object.keys(unreadMap).some((k) => k !== 'system');
  const hasMessageRootUnread = hasChatUnread || hasSystemUnreadByList || hasPendingRequests;

  // unreadTick 仅用于订阅触发重渲染；真正红点逻辑见下方 Dot show
  void unreadTick;

  const Dot = ({ show }: { show: boolean }) =>
    show ? (
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -4,
          top: -4,
          width: 12,
          height: 12,
          borderRadius: 999,
          background: '#ef4444',
          border: '2px solid #fff',
        }}
      />
    ) : null;

  const handleLogout = () => {
    clearTokens();
    router.replace('/');
  };

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === '/me') return pathname === '/me' || pathname.startsWith('/me/');
    if (href === '/circles') return pathname === '/circles' || pathname.startsWith('/circles/');
    if (href === '/write') return pathname === '/write';
    if (href.startsWith('/messages')) return pathname === '/messages' || pathname.startsWith('/messages/');
    if (href === '/admin/reports') return pathname === '/admin/reports' || pathname.startsWith('/admin/');
    return pathname === href;
  };

  // 管理员：轮询 open 举报数量用于红点提示
  const adminReportsKey = isAdmin ? '/social/admin/reports?status=open&take=1__header' : null;
  const { data: adminReportsData } = useSWR<{ reports: Array<{ id: string }> }>(
    adminReportsKey,
    () => apiFetch<{ reports: Array<{ id: string }> }>('/social/admin/reports?status=open&take=1'),
    { refreshInterval: 5000, dedupingInterval: 2000, refreshWhenHidden: true }
  );
  const hasOpenReports = (adminReportsData?.reports?.length ?? 0) > 0;

  return (
    <>
    <header
      className={`app-header${scrolled ? ' scrolled' : ''}`}
      style={{
        padding: '12px 20px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div className="header-bar" style={{ maxWidth: 1024, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 平台名称仅展示，不可点击跳转 */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--brand-gradient)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              boxShadow: '0 4px 10px rgba(0,112,243,0.28)',
            }}
          >
            U
          </span>
          <span
            style={{
              background: 'var(--brand-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            UniBlog
          </span>
        </span>
        <div className="header-nav" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {isAuthed ? (
            <>
              <Link
                href="/circles"
                prefetch={false}
                className={`nav-link${isActive('/circles') ? ' active' : ''}`}
                style={{ color: '#333', textDecoration: 'none' }}
              >
                圈子
              </Link>
              <Link
                href="/messages?focus=unread"
                prefetch={false}
                className={`nav-link${isActive('/messages') ? ' active' : ''}`}
                style={{ color: '#333', textDecoration: 'none' }}
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  消息
                  <Dot show={hasMessageRootUnread} />
                </span>
              </Link>
              <Link
                href="/me"
                prefetch={false}
                className={`nav-link${isActive('/me') ? ' active' : ''}`}
                style={{ color: '#333', textDecoration: 'none' }}
              >
                <span className="text-line-fit" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  {username ? `「${username}」的主页` : '「我」的主页'}
                </span>
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin/reports"
                  prefetch={false}
                  className={`nav-link${isActive('/admin/reports') ? ' active' : ''}`}
                  style={{ color: '#333', textDecoration: 'none' }}
                >
                  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    管理
                    <Dot show={hasOpenReports} />
                  </span>
                </Link>
              ) : null}
              <Link
                href="/write"
                prefetch={false}
                className="btn-primary"
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                  background: 'var(--brand-500)',
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 14,
                  fontWeight: 500,
                  boxShadow: 'var(--shadow-brand)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span aria-hidden>✨</span>
                <span>发帖</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="btn-ghost"
                style={{
                  border: '1px solid var(--border)',
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 13,
                }}
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="btn-secondary"
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--fg)',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                登录
              </Link>
              <Link
                href="/register"
                className="btn-primary"
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--brand-500)',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                  boxShadow: 'var(--shadow-brand)',
                }}
              >
                注册
              </Link>
            </>
          )}
        </div>
      </div>
      {/* 全局聊天未读监听：任何页面都保持“子树有未读 -> 根节点有红点” */}
      {isAuthed && friendIds.length > 0
        ? friendIds.map((friendId) => (
            <HeaderFriendUnreadWatcher key={friendId} friendId={friendId} accessToken={accessToken} />
          ))
        : null}
    </header>
    <Modal
      open={showLogoutConfirm}
      onClose={() => setShowLogoutConfirm(false)}
      title="确认退出登录？"
      description="退出后将返回主界面。"
      maxWidth={380}
      footer={
        <>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(false)}
            className="btn-secondary"
            style={{
              padding: '9px 18px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: '#fff',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="btn-danger"
            style={{
              padding: '9px 18px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--danger)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            确认退出
          </button>
        </>
      }
    />
    </>
  );
}
