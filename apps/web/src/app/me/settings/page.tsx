'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/http';
import { getTokens, setStoredDisplayUsername } from '../../../lib/token';
import Avatar from '../../../components/Avatar';

type MeUser = {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

const DISPLAY_NAME_MAX = 40;
const BIO_MAX = 200;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** 资料设置页：展示名 / 简介 / 头像 */
export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileOk, setProfileOk] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [avatarOk, setAvatarOk] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    apiFetch<{ user: MeUser }>('/auth/me')
      .then((d) => {
        if (cancelled) return;
        setUser(d.user);
        setDisplayName(d.user.displayName ?? '');
        setBio(d.user.bio ?? '');
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const mapProfileError = (code: string) => {
    if (code === 'display_name_too_long') return `展示名不能超过 ${DISPLAY_NAME_MAX} 字`;
    if (code === 'bio_too_long') return `简介不能超过 ${BIO_MAX} 字`;
    if (code === 'invalid_display_name') return '展示名格式不正确';
    if (code === 'invalid_bio') return '简介格式不正确';
    return '保存失败，请稍后重试';
  };

  const mapAvatarError = (code: string) => {
    if (code === 'invalid_avatar_mime') return '仅支持 jpg/png/webp/gif';
    if (code === 'avatar_too_large') return '头像不能超过 5MB';
    if (code === 'missing_file') return '请先选择图片';
    return '上传失败，请稍后重试';
  };

  const handleSaveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (savingProfile) return;
    setProfileError('');
    setProfileOk('');

    const trimmedName = displayName.trim();
    const trimmedBio = bio.trim();
    if (trimmedName.length > DISPLAY_NAME_MAX) {
      setProfileError(`展示名不能超过 ${DISPLAY_NAME_MAX} 字`);
      return;
    }
    if (trimmedBio.length > BIO_MAX) {
      setProfileError(`简介不能超过 ${BIO_MAX} 字`);
      return;
    }

    setSavingProfile(true);
    try {
      const d = await apiFetch<{ user: MeUser }>('/auth/me', {
        method: 'PATCH',
        body: { displayName: trimmedName || null, bio: trimmedBio || null },
      });
      setUser(d.user);
      setDisplayName(d.user.displayName ?? '');
      setBio(d.user.bio ?? '');
      setStoredDisplayUsername(d.user.displayName?.trim() || d.user.username);
      setProfileOk('已保存');
    } catch (err) {
      const code = (err as Error)?.message || 'unknown';
      setProfileError(mapProfileError(code));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePickAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError('');
    setAvatarOk('');

    if (!AVATAR_ALLOWED.includes(file.type)) {
      setAvatarError('仅支持 jpg/png/webp/gif');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError('头像不能超过 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploadingAvatar(true);
    try {
      const d = await apiFetch<{ user: MeUser }>('/auth/me/avatar', {
        method: 'POST',
        body: formData,
      });
      setUser(d.user);
      setAvatarOk('头像已更新');
    } catch (err) {
      const code = (err as Error)?.message || 'unknown';
      setAvatarError(mapAvatarError(code));
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 48,
          textAlign: 'center',
          color: '#999',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        加载中…
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section
        className="card"
        style={{
          padding: 20,
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>头像</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <Avatar
            avatarUrl={user.avatarUrl}
            username={user.username}
            displayName={user.displayName}
            size={80}
            fontSize={32}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={handlePickAvatar}
              disabled={uploadingAvatar}
              className="btn-primary"
              style={{
                padding: '9px 18px',
                borderRadius: 'var(--radius-pill)',
                background: uploadingAvatar ? 'var(--brand-300)' : 'var(--brand-500)',
                color: '#fff',
                border: 'none',
                fontSize: 14,
                cursor: uploadingAvatar ? 'progress' : 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              {uploadingAvatar ? '上传中…' : '更换头像'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
              支持 jpg / png / webp / gif，大小不超过 5 MB
            </div>
            {avatarError && (
              <div style={{ fontSize: 13, color: 'var(--danger)' }}>{avatarError}</div>
            )}
            {avatarOk && (
              <div style={{ fontSize: 13, color: 'var(--brand-500)' }}>{avatarOk}</div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>
      </section>

      <section
        className="card"
        style={{
          padding: 20,
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>基础资料</h3>
        <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 16 }}>
          用户名 <strong>@{user.username}</strong> 注册后不可修改；展示名可随时更改，会在帖子与评论中优先显示。
        </div>
        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              htmlFor="displayName"
              style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}
            >
              展示名
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
              placeholder={`留空将展示 @${user.username}`}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: 14,
                background: '#fff',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 4 }}>
              {displayName.length} / {DISPLAY_NAME_MAX}
            </div>
          </div>

          <div>
            <label
              htmlFor="bio"
              style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginBottom: 6 }}
            >
              简介
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX}
              rows={4}
              placeholder="一句话介绍自己（可选）"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: 14,
                background: '#fff',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 4 }}>
              {bio.length} / {BIO_MAX}
            </div>
          </div>

          {profileError && (
            <div style={{ fontSize: 13, color: 'var(--danger)' }}>{profileError}</div>
          )}
          {profileOk && (
            <div style={{ fontSize: 13, color: 'var(--brand-500)' }}>{profileOk}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={savingProfile}
              className="btn-primary"
              style={{
                padding: '10px 22px',
                borderRadius: 'var(--radius-pill)',
                background: savingProfile ? 'var(--brand-300)' : 'var(--brand-500)',
                color: '#fff',
                border: 'none',
                fontSize: 14,
                cursor: savingProfile ? 'progress' : 'pointer',
              }}
            >
              {savingProfile ? '保存中…' : '保存资料'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
