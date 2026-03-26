'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/http';
import { getTokens } from '../../../lib/token';
import PostCard from '../../../components/PostCard';

export default function UserPublicPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.userId as string;
  const [profile, setProfile] = useState<{ id: string; username: string } | null>(null);
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

        const data = await apiFetch<{ user: { id: string; username: string }; posts: any[] }>(
          `/posts/author/${userId}`
        );
        if (cancelled) return;
        setProfile(data.user);
        setPosts(data.posts);

        const initial: Record<string, any> = {};
        data.posts.forEach((p: any) => {
          initial[p.id] = { liked: false, favorited: false, shared: false };
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
      <h1 style={{ fontSize: '22px', marginBottom: '8px' }}>「{profile.username}」的主页</h1>
      <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>Ta 发布的帖子</p>
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
              postState={
                postStates[post.id] || {
                  liked: false,
                  favorited: false,
                  shared: false,
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
