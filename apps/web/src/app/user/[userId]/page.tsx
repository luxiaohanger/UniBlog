'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/http';
import { getTokens } from '../../../lib/token';
import PostCard from '../../../components/PostCard';
import AddFriendButton from '../../../components/AddFriendButton';
import Avatar from '../../../components/Avatar';
import ReportButton from '../../../components/ReportButton';

type PublicProfile = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
};

export default function UserPublicPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.userId as string;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [postStates, setPostStates] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const me = await apiFetch<{ user: { id: string } }>('/auth/me');
        if (!cancelled && me.user.id === userId) {
          router.replace('/me');
          return;
        }

        const data = await apiFetch<{ user: PublicProfile; posts: any[] }>(
          `/posts/author/${userId}`
        );
        if (cancelled) return;
        setProfile(data.user);
        setPosts(data.posts);

        const initial: Record<string, any> = {};
        data.posts.forEach((p: any) => {
          initial[p.id] = { liked: false, favorited: false };
        });
        setPostStates(initial);

        data.posts.forEach((p: any) => {
          apiFetch(`/social/posts/${p.id}/states`)
            .then((s: any) => {
              if (!cancelled) {
                setPostStates((prev) => ({ ...prev, [p.id]: s }));
              }
            })
            .catch(() => {});
        });
      } catch (e) {
        console.error(e);
        if (!cancelled && !getTokens()) router.replace('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '48px' }}>加载中…</div>;
  }

  if (!profile) {
    return <div style={{ textAlign: 'center', padding: '48px', color: '#999' }}>用户不存在</div>;
  }

  return (
    <div>
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: 20,
          borderRadius: 'var(--radius-lg)',
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <Avatar
          avatarUrl={profile.avatarUrl}
          username={profile.username}
          displayName={profile.displayName}
          size={64}
          fontSize={26}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="text-line-fit" style={{ fontSize: 22, margin: 0 }}>
              {profile.displayName?.trim() || profile.username}
            </h1>
            <AddFriendButton userId={profile.id} />
            <ReportButton
              targetType="user"
              targetId={profile.id}
              label="举报该用户"
              variant="link"
              style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-pill)', fontSize: 12 }}
            />
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
            @{profile.username}
          </div>
          {profile.bio ? (
            <div
              style={{
                fontSize: 14,
                color: 'var(--fg-secondary)',
                marginTop: 8,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
              }}
            >
              {profile.bio}
            </div>
          ) : null}
          <div style={{ fontSize: 13, color: '#666', marginTop: 12 }}>Ta 发布的帖子</div>
        </div>
      </div>
      {posts.length === 0 ? (
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
            color: '#999',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          暂无帖子
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              allowAdminDelete={false}
              postState={
                postStates[post.id] || {
                  liked: false,
                  favorited: false,
                }
              }
              onUpdatePost={(updated) =>
                setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
              }
              onUpdatePostState={(pid, partial) =>
                setPostStates((prev) => ({
                  ...prev,
                  [pid]: { ...prev[pid], ...partial },
                }))
              }
              onDeletePost={(postId) =>
                setPosts((prev) => prev.filter((p) => p.id !== postId))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
