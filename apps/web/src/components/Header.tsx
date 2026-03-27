'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { apiFetch } from '../lib/http';
import {
  getTokens,
  clearTokens,
  getStoredDisplayUsername,
  setStoredDisplayUsername,
} from '../lib/token';
import {
  getLastSeenMap,
  getSystemReadKeySet,
  getUnreadMap,
  setUnread,
  subscribeUnreadChanged,
} from '../lib/unread';

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

  const { data } = useSWR<{ user: { id: string; email: string; username: string } }>(
    accessToken ? '/auth/me' : null,
    () => apiFetch<{ user: { id: string; email: string; username: string } }>('/auth/me')
  );

  useEffect(() => {
    const u = data?.user?.username;
    if (u) setStoredDisplayUsername(u);
  }, [data?.user?.username]);

  const username = data?.user?.username ?? getStoredDisplayUsername() ?? undefined;
  // 以 token 为准：已登录在 /auth/me 返回前不再误显示「登录/注册」
  const isAuthed = !!accessToken;
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadTick, setUnreadTick] = useState(0);

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

  return (
    <header style={{ 
      background: 'white', 
      borderBottom: '1px solid #eaeaea', 
      padding: '12px 16px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 平台名称仅展示，不可点击跳转 */}
        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
          UniBlog
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {isAuthed ? (
            <>
              <Link href="/circles" prefetch={false} style={{ color: '#333', textDecoration: 'none' }}>
                圈子
              </Link>
              <Link
                href="/friends?focus=unread"
                prefetch={false}
                style={{ color: '#333', textDecoration: 'none' }}
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  消息
                  <Dot show={hasMessageRootUnread} />
                </span>
              </Link>
              <Link href="/me" prefetch={false} style={{ color: '#333', textDecoration: 'none' }}>
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  {username ? `「${username}」的主页` : '「我」的主页'}
                </span>
              </Link>
              <Link href="/write" prefetch={false} style={{ color: '#333', textDecoration: 'none' }}>
                发帖
              </Link>
              <button type="button" onClick={() => setShowLogoutConfirm(true)} style={{ 
                background: 'none', 
                border: '1px solid #ddd', 
                padding: '4px 12px', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}>退出登录</button>
            </>
          ) : (
            <>
              <Link href="/login" style={{ color: '#333', textDecoration: 'none' }}>登录</Link>
              <Link href="/register" style={{ color: '#333', textDecoration: 'none' }}>注册</Link>
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
      {showLogoutConfirm && (
        <div
          role="presentation"
          onClick={() => setShowLogoutConfirm(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
            zIndex: 300,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '12px',
              maxWidth: '360px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>确认退出登录？</div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>退出后将返回主界面。</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#e74c3c', color: '#fff' }}
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
