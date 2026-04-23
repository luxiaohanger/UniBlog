'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { apiFetch } from '@/features/client/http';
import { getTokens } from '@/features/client/token';

type Props = {
  userId: string;
  username: string;
  /** 可选展示名；为空时回退到 username */
  displayName?: string | null;
  style?: CSSProperties;
};

function useProfileHref(userId: string) {
  const accessToken = getTokens()?.accessToken ?? null;
  const { data } = useSWR<{ user: { id: string } }>(
    accessToken ? '/auth/me' : null,
    () => apiFetch<{ user: { id: string } }>('/auth/me')
  );
  const selfId = data?.user?.id;
  return selfId === userId ? '/me' : `/user/${userId}`;
}

/** 帖子/评论中用户名：本人进「我的」，他人进对方主页；优先展示 displayName，回退 username */
export function UserProfileLink({ userId, username, displayName, style }: Props) {
  const href = useProfileHref(userId);
  const label = displayName?.trim() || username;

  return (
    <Link
      href={href}
      prefetch={false}
      className="text-line-fit"
      style={{
        display: 'inline-block',
        fontWeight: 500,
        color: '#333',
        textDecoration: 'none',
        verticalAlign: 'bottom',
        ...style,
      }}
      title={displayName ? `@${username}` : undefined}
    >
      {label}
    </Link>
  );
}

/** 回复行里浅色 @某人，可点进对方主页 */
export function AtUserLink({ userId, mentionUsername }: { userId: string; mentionUsername: string }) {
  const href = useProfileHref(userId);

  return (
    <Link
      href={href}
      prefetch={false}
      className="text-line-fit"
      style={{
        display: 'inline-block',
        fontSize: 12,
        color: '#c0c0c0',
        textDecoration: 'none',
        marginRight: 4,
        verticalAlign: 'bottom',
      }}
    >
      @{mentionUsername}
    </Link>
  );
}
