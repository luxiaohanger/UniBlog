'use client';

import { useMemo, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { apiFetch } from '../lib/http';
import { getTokens } from '../lib/token';
import { useRouter } from 'next/navigation';

type Relationship =
  | { kind: 'SELF' }
  | { kind: 'NONE' }
  | { kind: 'FRIENDS' }
  | { kind: 'PENDING'; requestId: string }
  | { kind: 'INCOMING'; requestId: string };

type RelationshipRes = { relationship: Relationship };

export default function AddFriendButton({ userId }: { userId: string }) {
  const router = useRouter();
  const accessToken = getTokens()?.accessToken ?? null;
  const key = useMemo(
    () => (accessToken && userId ? `/social/friends/relationship/${userId}` : null),
    [accessToken, userId]
  );

  const { data, isLoading } = useSWR<RelationshipRes>(
    key,
    () => apiFetch<RelationshipRes>(`/social/friends/relationship/${userId}`)
  );

  const relationship = data?.relationship;
  const [submitting, setSubmitting] = useState(false);

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    fontSize: 14,
    lineHeight: 1,
    userSelect: 'none',
    minWidth: 92,
  };

  if (!accessToken) {
    return (
      <button type="button" style={{ ...btnStyle, opacity: 0.7 }} disabled>
        加好友
      </button>
    );
  }

  if (isLoading && !relationship) {
    return (
      <button type="button" style={{ ...btnStyle, opacity: 0.75 }} disabled>
        加载中
      </button>
    );
  }

  if (!relationship || relationship.kind === 'NONE') {
    return (
      <button
        type="button"
        disabled={submitting}
        style={{
          ...btnStyle,
          borderColor: '#0070f3',
          color: '#0070f3',
          opacity: submitting ? 0.7 : 1,
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
        onClick={async () => {
          if (submitting) return;
          if (!window.confirm('确定向对方发送好友申请吗？')) return;
          setSubmitting(true);
          try {
            await apiFetch(`/social/friends/request/${userId}`, { method: 'POST' });
            if (key) {
              globalMutate(key, { relationship: { kind: 'PENDING', requestId: 'pending' } }, false);
              globalMutate(key);
            }
          } catch (e) {
            console.error(e);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        加好友
      </button>
    );
  }

  if (relationship.kind === 'SELF') {
    return null;
  }

  if (relationship.kind === 'FRIENDS') {
    return (
      <button
        type="button"
        style={{
          ...btnStyle,
          borderColor: '#0070f3',
          background: '#0070f3',
          color: '#fff',
          cursor: 'pointer',
        }}
        onClick={() => {
          router.push(`/messages?friendId=${encodeURIComponent(userId)}`);
        }}
      >
        发信息
      </button>
    );
  }

  if (relationship.kind === 'PENDING') {
    return (
      <button type="button" style={{ ...btnStyle, opacity: 0.75 }} disabled>
        申请中
      </button>
    );
  }

  // INCOMING：已有对方请求，这里不代替“处理申请”页面，先用提示态
  return (
    <button type="button" style={{ ...btnStyle, opacity: 0.8 }} disabled>
      待处理
    </button>
  );
}

