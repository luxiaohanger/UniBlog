'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { apiFetch } from '../lib/http';
import { getTokens } from '../lib/token';

type Props = {
  userId: string;
  username: string;
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

/** 帖子/评论中用户名：本人进「我的」，他人进对方主页 */
export function UserProfileLink({ userId, username, style }: Props) {
  const href = useProfileHref(userId);

  return (
    <Link
      href={href}
      prefetch={false}
      style={{
        fontWeight: 500,
        color: '#333',
        textDecoration: 'none',
        ...style,
      }}
    >
      {username}
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
      style={{
        fontSize: 12,
        color: '#c0c0c0',
        textDecoration: 'none',
        marginRight: 4,
      }}
    >
      @{mentionUsername}
    </Link>
  );
}
