'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { apiFetch } from '@/features/client/http';
import { getTokens } from '@/features/client/token';
import { useRouter, useSearchParams } from 'next/navigation';
import Avatar from '../../components/Avatar';
import {
  clearUnread,
  getLastSeenMap,
  getSystemReadKeySet,
  getUnreadMap,
  markSeen,
  markSystemNotificationRead,
  markSystemNotificationsRead,
  setUnread,
  subscribeUnreadChanged,
} from '../../lib/unread';

type Friend = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  relationStatus: 'ACCEPTED' | 'DECLINED';
};
type FriendsRes = { friends: Friend[] };

type MeRes = {
  user: {
    id: string;
    username: string;
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
};

type PendingFriendRequest = {
  id: string;
  status: 'PENDING';
  createdAt: string;
  sender: { id: string; username: string; displayName?: string | null; avatarUrl?: string | null };
};

type ChatMessage = {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
};

type MessagesRes = { messages: ChatMessage[] };
type NotificationsRes = {
  notifications: Array<{
    kind:
      | 'post_commented'
      | 'comment_replied'
      | 'post_liked'
      | 'post_favorited'
      | 'post_deleted_by_admin'
      | 'comment_deleted_by_admin'
      | 'report_resolved';
    createdAt: string;
    actor: { id: string; username: string; displayName?: string | null; avatarUrl?: string | null };
    post: { id: string; content: string };
    comment?: { id: string; content: string };
    targetComment?: { id: string; content: string } | null;
    layerMainId?: string;
  }>;
};

// 消息页里对"联系人侧栏"的本地偏好：置顶 / 隐藏会话
// 采用新 key 名以对齐页面语义；读取时兼容旧 'friends_*' key，迁移到新 key 即可，
// 从而不丢失既有用户的置顶/隐藏状态。
const PINNED_KEY = 'messages_pinned_ids';
const HIDDEN_KEY = 'messages_hidden_ids';
const LEGACY_PINNED_KEY = 'friends_pinned_ids';
const LEGACY_HIDDEN_KEY = 'friends_hidden_ids';

function compareISO(a: string, b: string) {
  // ISO 字符串按字典序即可比较时间先后（同一时区格式）
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function getNotificationKey(it: {
  kind: string;
  createdAt: string;
  actor: { id: string };
  post: { id: string };
  comment?: { id: string };
}) {
  return `${it.kind}|${it.createdAt}|${it.actor.id}|${it.post.id}|${it.comment?.id ?? ''}`;
}

function FriendRow(props: {
  friend: Friend;
  active: boolean;
  pinned: boolean;
  unread: boolean;
  relationAccepted: boolean;
  onOpen: () => void;
  onMenu: () => void;
  showMenu?: boolean;
}) {
  const { friend: f, active, pinned, unread, relationAccepted, onOpen, onMenu, showMenu = true } = props;
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        background: active ? '#eff6ff' : '#fff',
        borderColor: active ? '#93c5fd' : '#e5e7eb',
        borderRadius: 10,
        padding: '10px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'space-between',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 0,
          flex: 1,
          textAlign: 'left',
        }}
      >
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar
            avatarUrl={f.id === 'system' ? null : f.avatarUrl}
            username={f.username}
            displayName={f.displayName}
            size={34}
          />
          {unread ? (
            <span
              aria-label="未读消息"
              style={{
                position: 'absolute',
                right: -1,
                top: -1,
                width: 14,
                height: 14,
                borderRadius: 999,
                background: '#ef4444',
                border: '2px solid #fff',
              }}
            />
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="text-line-fit" style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            {f.displayName?.trim() || f.username}
            {pinned ? (
              <span style={{ marginLeft: 6, fontSize: 12, color: '#d97706' }}>
                置顶
              </span>
            ) : null}
            {!relationAccepted ? (
              <span
                title="当前不是好友关系，发送消息会被拒绝"
                style={{ marginLeft: 6, fontSize: 12, color: '#dc2626' }}
              >
                ❗
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
            点击聊天
          </div>
        </div>
      </button>

      {showMenu ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onMenu}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#fff',
              cursor: 'pointer',
              color: '#64748b',
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="好友操作"
          >
            ⋮
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FriendUnreadWatcher(props: { friendId: string; myId: string | null; active: boolean }) {
  const { friendId, myId, active } = props;
  const key = myId && friendId && !active ? `/social/messages/${friendId}__watch` : null;
  const { data } = useSWR<MessagesRes>(
    key,
    () => apiFetch<MessagesRes>(`/social/messages/${friendId}`),
    { refreshInterval: !active ? 3500 : 0, dedupingInterval: 1200 }
  );

  useEffect(() => {
    if (!data?.messages?.length) return;
    const last = data.messages[data.messages.length - 1];
    if (!last) return;
    if (last.senderId !== friendId) return;
    const createdAt = String(last.createdAt);
    const lastSeen = getLastSeenMap()[friendId] || '';
    if (!lastSeen || compareISO(createdAt, lastSeen) > 0) setUnread(friendId, createdAt);
  }, [data?.messages?.length, friendId]);

  return null;
}

export default function FriendsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokens = getTokens();
  const accessToken = tokens?.accessToken ?? null;

  useEffect(() => {
    if (!getTokens()) router.replace('/login');
  }, [router]);

  const { data: meData } = useSWR<MeRes>(
    accessToken ? '/auth/me' : null,
    () => apiFetch<MeRes>('/auth/me')
  );
  const myId = meData?.user?.id ?? null;
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);

  const pendingKey = accessToken ? '/social/friends/requests/pending__system' : null;
  const { data: pendingData, isLoading: pendingLoading, mutate: mutatePending } = useSWR<{
    requests: PendingFriendRequest[];
  }>(pendingKey, () => apiFetch<{ requests: PendingFriendRequest[] }>('/social/friends/requests/pending'), {
    refreshInterval: 2500,
    dedupingInterval: 800,
    refreshWhenHidden: true,
  });
  const pendingRequests = pendingData?.requests ?? [];

  const { data: friendsData, isLoading: friendsLoading } = useSWR<FriendsRes>(
    accessToken ? '/social/friends/list' : null,
    () => apiFetch<FriendsRes>('/social/friends/list')
  );

  const friends = friendsData?.friends ?? [];
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [deletingFriendId, setDeletingFriendId] = useState<string | null>(null);
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'system' | 'friend'>('friend');
  const activeFriend = useMemo(
    () => friends.find((f) => f.id === activeFriendId) ?? null,
    [friends, activeFriendId]
  );
  const canSendToActive = activeFriend?.relationStatus === 'ACCEPTED';

  const [unreadVersion, setUnreadVersion] = useState(0);
  useEffect(() => {
    return subscribeUnreadChanged(() => setUnreadVersion((v) => v + 1));
  }, []);

  // 读本地偏好；新 key 优先，缺失则回落旧 'friends_*' key 并迁移到新 key
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      let raw = window.localStorage.getItem(PINNED_KEY);
      if (!raw) {
        const legacy = window.localStorage.getItem(LEGACY_PINNED_KEY);
        if (legacy) {
          window.localStorage.setItem(PINNED_KEY, legacy);
          window.localStorage.removeItem(LEGACY_PINNED_KEY);
          raw = legacy;
        }
      }
      if (!raw) return;
      const ids = JSON.parse(raw) as unknown;
      if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) setPinnedIds(ids);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      let raw = window.localStorage.getItem(HIDDEN_KEY);
      if (!raw) {
        const legacy = window.localStorage.getItem(LEGACY_HIDDEN_KEY);
        if (legacy) {
          window.localStorage.setItem(HIDDEN_KEY, legacy);
          window.localStorage.removeItem(LEGACY_HIDDEN_KEY);
          raw = legacy;
        }
      }
      if (!raw) return;
      const ids = JSON.parse(raw) as unknown;
      if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) setHiddenIds(ids);
    } catch {
      // ignore
    }
  }, []);

  // 历史兼容：如果曾误把正常好友隐藏，这里自动清理，确保正常好友始终可见
  useEffect(() => {
    if (!friends.length || !hiddenIds.length) return;
    const declinedIds = new Set(
      friends.filter((f) => f.relationStatus !== 'ACCEPTED').map((f) => f.id)
    );
    const nextHidden = hiddenIds.filter((id) => declinedIds.has(id));
    if (nextHidden.length === hiddenIds.length) return;
    persistHidden(nextHidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendsData]);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const sortedFriends = useMemo(() => {
    const hiddenSet = new Set(hiddenIds);
    const list = friends.filter((f) => !hiddenSet.has(f.id));
    list.sort((a, b) => {
      const ap = pinnedSet.has(a.id) ? 1 : 0;
      const bp = pinnedSet.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return a.username.localeCompare(b.username, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    });
    return list;
  }, [friends, pinnedSet, hiddenIds]);

  useEffect(() => {
    const q = searchParams.get('friendId');
    if (q && sortedFriends.some((f) => f.id === q)) {
      setActiveTab('friend');
      setActiveFriendId(q);
      return;
    }
    if (!activeFriendId && sortedFriends.length > 0) setActiveFriendId(sortedFriends[0].id);
  }, [sortedFriends, activeFriendId, searchParams]);

  // 当前会话若不在可见联系人列表（如已删除并隐藏），立即回到初始态
  useEffect(() => {
    if (!activeFriendId) return;
    const visible = sortedFriends.some((f) => f.id === activeFriendId);
    if (visible) return;
    setActiveFriendId(null);
    setDraft('');
  }, [sortedFriends, activeFriendId]);

  const msgKey = accessToken && activeFriendId ? `/social/messages/${activeFriendId}` : null;
  const {
    data: msgData,
    isLoading: msgLoading,
    error: msgError,
    mutate: mutateMessages,
  } = useSWR<MessagesRes>(
    msgKey,
    () => apiFetch<MessagesRes>(`/social/messages/${activeFriendId}`),
    { refreshInterval: activeFriendId ? 1500 : 0 }
  );

  const messages = msgData?.messages ?? [];
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messageBoxRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (activeTab !== 'friend') return;
    if (!activeFriendId) return;
    // 进入聊天/收到新消息时：强制定位到底部（最新消息）
    if (messageBoxRef.current) {
      messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [activeFriendId, messages.length, activeTab]);

  // 当前聊天框打开状态下：如果收到对方的新消息，视为已读（已点击打开聊天框）
  useEffect(() => {
    if (!activeFriendId) return;
    if (activeTab !== 'friend') return;
    if (!myId) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.senderId !== activeFriendId) return;
    const seenAt = String(last.createdAt);
    clearUnread(activeFriendId);
    markSeen(activeFriendId, seenAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFriendId, messages.length, myId, activeTab]);

  const sysKey = accessToken ? '/social/notifications' : null;
  const { data: sysData, isLoading: sysLoading } = useSWR<NotificationsRes>(
    sysKey,
    () => apiFetch<NotificationsRes>('/social/notifications'),
    { refreshInterval: activeTab === 'system' ? 1500 : 2500, dedupingInterval: 800, refreshWhenHidden: true }
  );
  const sysItems = sysData?.notifications ?? [];

  const firstLine = (t: string) => String(t || '').split('\n')[0]?.trim() || '';
  const systemReadKeys = getSystemReadKeySet();
  const unreadSystemItems = sysItems.filter((it) => !systemReadKeys.has(getNotificationKey(it)));
  const hasSystemUnread = unreadSystemItems.length > 0;

  // 从导航栏进入：自动定位到“最上方未读”（好友优先，其次系统信息；都没有则系统信息）
  useEffect(() => {
    if (searchParams.get('focus') !== 'unread') return;
    if (!sortedFriends.length) return;
    const unreadMap = getUnreadMap();
    const firstUnreadFriend = sortedFriends.find((f) => !!unreadMap[f.id]);
    if (firstUnreadFriend) {
      setActiveTab('friend');
      setActiveFriendId(firstUnreadFriend.id);
      return;
    }
    // 没有好友未读：跳系统信息（若系统存在未读则保持红点直到点“去看看/清除所有”）
    setActiveTab('system');
    setMenuOpenFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedFriends.length, hasSystemUnread]);

  // 系统消息未读与上级提示联动：下级有未读 -> 系统/导航有；下级清空 -> 上级清空
  useEffect(() => {
    if (hasSystemUnread) {
      const latestAt = String(unreadSystemItems[0]?.createdAt ?? new Date().toISOString());
      setUnread('system', latestAt);
      return;
    }
    clearUnread('system');
  }, [hasSystemUnread, unreadSystemItems.length, activeTab]);

  const isSubmitShortcut = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as KeyboardEvent;
    if (native.isComposing || native.keyCode === 229) return false;
    return e.key === 'Enter' && (e.ctrlKey || e.metaKey);
  };

  const persistPinned = (next: string[]) => {
    setPinnedIds(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PINNED_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const persistHidden = (next: string[]) => {
    setHiddenIds(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const togglePin = (friendId: string) => {
    setMenuOpenFor(null);
    if (pinnedSet.has(friendId)) {
      persistPinned(pinnedIds.filter((id) => id !== friendId));
      return;
    }
    persistPinned([friendId, ...pinnedIds.filter((id) => id !== friendId)]);
  };

  const deleteChatLocal = (friend: Friend) => {
    setMenuOpenFor(null);
    if (!window.confirm(`确定删除与「${friend.username}」的聊天吗？（本地移除）`)) return;
    persistHidden([friend.id, ...hiddenIds.filter((id) => id !== friend.id)]);
    if (pinnedSet.has(friend.id)) persistPinned(pinnedIds.filter((id) => id !== friend.id));
    globalMutate(`/social/messages/${friend.id}`, { messages: [] }, false);
    if (activeFriendId === friend.id) {
      setActiveFriendId(null);
      setDraft('');
    }
  };

  const deleteFriend = async (friend: Friend) => {
    setMenuOpenFor(null);
    if (!window.confirm(`确定删除好友「${friend.username}」吗？`)) return;
    setDeletingFriendId(friend.id);
    try {
      await apiFetch(`/social/friends/${friend.id}`, { method: 'DELETE' });

      // 刷新好友列表
      await globalMutate('/social/friends/list');
      // 清理置顶记录
      if (pinnedSet.has(friend.id)) persistPinned(pinnedIds.filter((id) => id !== friend.id));

      // 删除方：确认删除后不再显示对方与聊天记录
      persistHidden([friend.id, ...hiddenIds.filter((id) => id !== friend.id)]);
      globalMutate(`/social/messages/${friend.id}`, { messages: [] }, false);
      if (activeFriendId === friend.id) {
        setActiveFriendId(null);
        setDraft('');
      }
    } catch (e) {
      console.error(e);
      alert('删除好友失败，请重试');
    } finally {
      setDeletingFriendId(null);
    }
  };

  const send = async () => {
    if (!activeFriendId) return;
    if (!canSendToActive) {
      alert('对方不是你的好友，无法发送消息。请前往对方主页重新添加好友。');
      return;
    }
    const content = draft.trim();
    if (!content) return;
    if (sending) return;
    setSending(true);
    try {
      await apiFetch(`/social/messages/${activeFriendId}`, {
        method: 'POST',
        body: { content },
      });
      setDraft('');
      await mutateMessages();
    } catch (e: unknown) {
      const msg = String((e as { message?: unknown } | null)?.message ?? '');
      if (msg.includes('forbidden_not_friends')) {
        alert('对方不是你的好友，无法发送消息。请前往对方主页重新添加好友。');
        return;
      }
      console.error(e);
      alert('发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="messages-shell"
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
        minHeight: 'calc(100vh - 110px)',
      }}
    >
      {/* Sidebar */}
      <aside
        className="messages-sidebar"
        style={{
          width: 260,
          flexShrink: 0,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>我的朋友</div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            {friendsLoading ? '加载中…' : `${sortedFriends.length} 位好友`}
          </div>
        </div>

        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 系统信息（固定项） */}
          {(() => {
            const unreadMap = getUnreadMap();
            const hasUnread = (!!unreadMap['system'] || pendingRequests.length > 0) && activeTab !== 'system';
            return (
              <FriendRow
                friend={{ id: 'system', username: '系统信息', relationStatus: 'ACCEPTED' }}
                active={activeTab === 'system'}
                pinned={false}
                unread={hasUnread}
                relationAccepted={true}
                showMenu={false}
                onOpen={() => {
                  setMenuOpenFor(null);
                  setActiveTab('system');
                  // 点击系统信息仅清除「非评论类」提示；评论类需点“去看看”逐条消除
                  const nonCommentUnread = unreadSystemItems.filter(
                    (it) => it.kind !== 'post_commented' && it.kind !== 'comment_replied'
                  );
                  if (nonCommentUnread.length) {
                    markSystemNotificationsRead(nonCommentUnread.map((it) => getNotificationKey(it)));
                  }
                }}
                onMenu={() => {
                  // 系统信息不支持管理菜单
                }}
              />
            );
          })()}

          {friendsLoading ? (
            <div style={{ padding: 12, color: '#999', fontSize: 14 }}>加载好友列表…</div>
          ) : sortedFriends.length === 0 ? (
            <div style={{ padding: 12, color: '#999', fontSize: 14 }}>暂无好友</div>
          ) : (
            sortedFriends.map((f) => {
              const active = activeTab === 'friend' && f.id === activeFriendId;
              const unreadMap = getUnreadMap();
              // 仅在“点击列表项打开会话”后清未读；自动选中不应提前清除
              const hasUnread = !!unreadMap[f.id];
              return (
                <div key={f.id} style={{ position: 'relative' }}>
                  <FriendUnreadWatcher friendId={f.id} myId={myId} active={active} />
                  <FriendRow
                    friend={f}
                    active={active}
                    pinned={pinnedSet.has(f.id)}
                    unread={hasUnread}
                    relationAccepted={f.relationStatus === 'ACCEPTED'}
                    onOpen={() => {
                      // 打开聊天框：对应提示消失 + 写入已读时间戳（以当前最新消息为准）
                      setActiveTab('friend');
                      setActiveFriendId(f.id);
                      clearUnread(f.id);
                      markSeen(f.id, new Date().toISOString());
                    }}
                    onMenu={() => setMenuOpenFor((v) => (v === f.id ? null : f.id))}
                  />
                  {menuOpenFor === f.id ? (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 42,
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                        overflow: 'hidden',
                        zIndex: 50,
                        minWidth: 140,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenFor(null);
                          router.push(`/user/${encodeURIComponent(f.id)}`);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: 'none',
                          background: '#fff',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        Ta的主页
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(f.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: 'none',
                          borderTop: '1px solid #f1f5f9',
                          background: '#fff',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        {pinnedSet.has(f.id) ? '取消置顶' : '置顶'}
                      </button>
                      {f.relationStatus !== 'ACCEPTED' ? (
                        <button
                          type="button"
                          onClick={() => deleteChatLocal(f)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 12px',
                            border: 'none',
                            borderTop: '1px solid #f1f5f9',
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: '#c0392b',
                          }}
                        >
                          删除聊天
                        </button>
                      ) : null}
                      {f.relationStatus === 'ACCEPTED' ? (
                        <button
                          type="button"
                          disabled={deletingFriendId === f.id}
                          onClick={() => deleteFriend(f)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 12px',
                            border: 'none',
                            borderTop: '1px solid #f1f5f9',
                            background: '#fff',
                            cursor: deletingFriendId === f.id ? 'not-allowed' : 'pointer',
                            fontSize: 14,
                            color: '#c0392b',
                            opacity: deletingFriendId === f.id ? 0.7 : 1,
                          }}
                        >
                          {deletingFriendId === f.id ? '删除中…' : '删除好友'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ChatWindow —— 对齐全站页面切换模式：侧栏静态，聊天板块从下方上滑浮现 */}
      <section
        className="slide-up-enter"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <div
          className="messages-main-inner"
          style={{
            flex: 1,
            minWidth: 360,
            height: 'calc(100vh - 110px)',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            resize: 'both',
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 110px)',
            minHeight: 420,
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div className="text-line-fit" style={{ fontSize: 16, fontWeight: 800 }}>
                {activeTab === 'system'
                  ? '系统信息'
                  : activeFriend
                    ? activeFriend.displayName?.trim() || activeFriend.username
                    : '选择一个好友开始聊天'}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                {activeTab === 'system'
                  ? sysLoading
                    ? '加载系统信息…'
                    : '实时刷新中'
                  : activeFriendId
                    ? msgLoading
                      ? '加载消息…'
                      : '实时刷新中'
                    : '—'}
              </div>
            </div>
            {activeTab === 'system' ? (
              <button
                type="button"
                onClick={() => {
                  markSystemNotificationsRead(sysItems.map((it) => getNotificationKey(it)));
                  clearUnread('system');
                }}
                style={{
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 13,
                  color: '#475569',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                清除所有
              </button>
            ) : null}
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: 16,
              overflowY: 'auto',
              background: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
            ref={messageBoxRef}
          >
            {activeTab === 'system' ? (
              pendingLoading && sysItems.length === 0 && pendingRequests.length === 0 ? (
                <div style={{ color: '#999', textAlign: 'center', padding: '48px 16px' }}>
                  加载系统信息中…
                </div>
              ) : sysItems.length === 0 && pendingRequests.length === 0 ? (
                <div style={{ color: '#999', textAlign: 'center', padding: '48px 16px' }}>
                  暂无系统信息
                </div>
              ) : (
                <>
                  {/* 好友申请（迁移自个人主页） */}
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 12,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>好友申请</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {pendingLoading ? '加载中…' : `${pendingRequests.length} 条待处理`}
                      </div>
                    </div>
                    {pendingLoading ? (
                      <div style={{ marginTop: 10, color: '#999', fontSize: 13 }}>加载好友申请…</div>
                    ) : pendingRequests.length === 0 ? (
                      <div style={{ marginTop: 10, color: '#999', fontSize: 13 }}>暂无待处理申请</div>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {pendingRequests.map((r) => {
                          const disabled = actingRequestId === r.id;
                          return (
                            <div
                              key={r.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                padding: 10,
                                borderRadius: 10,
                                border: '1px solid #f1f5f9',
                                background: '#fff',
                                flexWrap: 'wrap',
                              }}
                            >
                              <div style={{ minWidth: 180 }}>
                                <button
                                  type="button"
                                  onClick={() => router.push(`/user/${encodeURIComponent(r.sender.id)}`)}
                                  className="text-line-fit"
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: 0,
                                    cursor: 'pointer',
                                    color: '#2563eb',
                                    fontWeight: 800,
                                    fontSize: 14,
                                    textAlign: 'left',
                                  }}
                                >
                                  {r.sender.displayName?.trim() || r.sender.username}
                                </button>
                                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                                  {new Date(r.createdAt).toLocaleString()}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    border: '1px solid #0070f3',
                                    background: '#0070f3',
                                    color: '#fff',
                                    fontSize: 14,
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    opacity: disabled ? 0.7 : 1,
                                  }}
                                  onClick={async () => {
                                    if (!pendingKey) return;
                                    if (!window.confirm(`确定同意「${r.sender.username}」的好友申请吗？`)) return;
                                    setActingRequestId(r.id);
                                    try {
                                      await apiFetch(`/social/friends/request/${r.id}`, {
                                        method: 'PATCH',
                                        body: { status: 'ACCEPTED' },
                                      });
                                      await mutatePending();
                                      await globalMutate('/social/friends/list');
                                    } finally {
                                      setActingRequestId(null);
                                    }
                                  }}
                                >
                                  同意
                                </button>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    border: '1px solid #e5e7eb',
                                    background: '#fff',
                                    color: '#111827',
                                    fontSize: 14,
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                    opacity: disabled ? 0.7 : 1,
                                  }}
                                  onClick={async () => {
                                    if (!pendingKey) return;
                                    if (!window.confirm(`确定拒绝「${r.sender.username}」的好友申请吗？`)) return;
                                    setActingRequestId(r.id);
                                    try {
                                      await apiFetch(`/social/friends/request/${r.id}`, {
                                        method: 'PATCH',
                                        body: { status: 'DECLINED' },
                                      });
                                      await mutatePending();
                                    } finally {
                                      setActingRequestId(null);
                                    }
                                  }}
                                >
                                  拒绝
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {sysItems.map((it, idx) => {
                  const key = getNotificationKey(it);
                  const isUnread = !systemReadKeys.has(key);
                  const timeText = new Date(it.createdAt).toLocaleString();
                  const postLine = firstLine(it.post?.content || '');
                  const commentLine = firstLine((it.targetComment?.content ?? it.comment?.content ?? '') || '');
                  return (
                    <div
                      key={`${it.kind}-${it.createdAt}-${idx}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 12,
                        padding: '12px 12px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        cursor: 'default',
                        background: isUnread ? '#f8fbff' : '#fff',
                        borderColor: isUnread ? '#bfdbfe' : '#e5e7eb',
                      }}
                    >
                      <div className="text-line-fit" style={{ fontSize: 13, color: '#334155', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/user/${encodeURIComponent(it.actor.id)}`);
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#2563eb',
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {it.actor.displayName?.trim() || it.actor.username}
                        </button>
                        {it.kind === 'post_liked' ? (
                          <> 给你的帖子 “{postLine}” 点赞了</>
                        ) : it.kind === 'post_favorited' ? (
                          <> 收藏了你的帖子 “{postLine}”</>
                        ) : it.kind === 'post_commented' ? (
                          <> 评论了你的帖子 “{postLine}”</>
                        ) : it.kind === 'post_deleted_by_admin' ? (
                          <> 你的帖子 “{postLine}” 被管理员删除了</>
                        ) : it.kind === 'comment_deleted_by_admin' ? (
                          <> 你的评论 “{commentLine}” 被管理员删除了</>
                        ) : it.kind === 'report_resolved' ? (
                          it.comment?.id ? (
                            <> 你的评论 “{commentLine}” 因举报通过审核被删除</>
                          ) : (
                            <> 你的帖子 “{postLine}” 因举报通过审核被删除</>
                          )
                        ) : (
                          <> 回复了你的评论 “{commentLine}”</>
                        )}
                        {isUnread ? (
                          <span
                            style={{
                              marginLeft: 8,
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: '#ef4444',
                              verticalAlign: 'middle',
                            }}
                          />
                        ) : null}
                      </div>
                      {it.kind === 'post_commented' || it.kind === 'comment_replied' ? (
                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const commentId = it.comment?.id;
                              if (!commentId) return;
                              markSystemNotificationRead(key);
                              router.push(
                                `/circles?postId=${encodeURIComponent(it.post.id)}&commentId=${encodeURIComponent(commentId)}`
                              );
                            }}
                            style={{
                              border: '1px solid #0070f3',
                              background: '#fff',
                              color: '#0070f3',
                              borderRadius: 10,
                              padding: '6px 10px',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            去看看
                          </button>
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{timeText}</div>
                    </div>
                  );
                })}
                </>
              )
            ) : (
              <>
                {msgError ? (
              <div
                style={{
                  marginBottom: 6,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid #fde68a',
                  background: '#fffbeb',
                  color: '#92400e',
                  fontSize: 13,
                }}
              >
                当前会话可能已失效（对方不再是你的好友）。历史消息将保留在本地缓存中。
              </div>
            ) : null}
            {!activeFriendId ? (
              <div style={{ color: '#999', textAlign: 'center', padding: '48px 16px' }}>
                请选择一个聊天框
              </div>
            ) : msgLoading && messages.length === 0 ? (
              <div style={{ color: '#999', textAlign: 'center', padding: '48px 16px' }}>
                加载消息中…
              </div>
            ) : messages.length === 0 ? (
              <div style={{ color: '#999', textAlign: 'center', padding: '48px 16px' }}>
                暂无消息，先打个招呼吧
              </div>
            ) : (
              messages.map((m) => {
                const isMine = !!myId && m.senderId === myId;
                const timeText = new Date(m.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMine ? 'flex-end' : 'flex-start',
                      gap: 4,
                    }}
                  >
                    <div
                      className="text-line-fit"
                      style={{
                        background: isMine ? '#0070f3' : '#fff',
                        color: isMine ? '#fff' : '#111827',
                        border: isMine ? 'none' : '1px solid #e5e7eb',
                        padding: '10px 12px',
                        borderRadius: 14,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                      }}
                      title={new Date(m.createdAt).toLocaleString()}
                    >
                      {m.content}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#94a3b8',
                        padding: isMine ? '0 6px 0 0' : '0 0 0 6px',
                      }}
                    >
                      {timeText}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
              </>
            )}
          </div>

          {activeTab === 'system' ? null : (
            <div
              style={{
                padding: 12,
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-end',
              }}
            >
              <textarea
                className="text-line-fit"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (!canSendToActive) return;
                  if (isSubmitShortcut(e)) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={!activeFriendId || sending || !canSendToActive}
                placeholder={
                  !activeFriendId
                    ? '请先选择好友'
                    : !canSendToActive
                      ? '当前不是好友关系，已禁用发送；可前往 Ta 的主页重新添加'
                      : 'Ctrl/Cmd + Enter 发送；Enter 换行…'
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  resize: 'vertical',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  opacity: !activeFriendId || !canSendToActive ? 0.7 : 1,
                  minHeight: 44,
                }}
              />
              <button
                type="button"
                onClick={send}
                disabled={!activeFriendId || sending || draft.trim().length === 0 || !canSendToActive}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid #0070f3',
                  background: '#0070f3',
                  color: '#fff',
                  fontSize: 14,
                  cursor:
                    !activeFriendId || sending || draft.trim().length === 0 || !canSendToActive
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    !activeFriendId || sending || draft.trim().length === 0 || !canSendToActive ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                发送
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

