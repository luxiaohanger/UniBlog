'use client';

import type { CSSProperties } from 'react';
import { API_BASE_URL } from '../lib/config';

type Props = {
  /** 后端返回的相对 URL，形如 `/uploads/avatar-xxx.jpg`；为空则回退到首字母 */
  avatarUrl?: string | null;
  /** 用于首字母回退：优先 displayName，其次 username */
  username?: string | null;
  displayName?: string | null;
  size?: number;
  style?: CSSProperties;
  /** 自定义字号，未传时按 size 自动推断 */
  fontSize?: number;
};

/**
 * 全局统一的头像展示：
 * - 有 avatarUrl 时直接渲染 <img>
 * - 无 avatarUrl 时渲染「渐变圆 + 首字母」，与原 me/layout 头像风格一致
 */
export default function Avatar({
  avatarUrl,
  username,
  displayName,
  size = 40,
  style,
  fontSize,
}: Props) {
  const label = (displayName || username || 'U').trim();
  const initial = label.charAt(0).toUpperCase() || 'U';
  const computedFontSize = fontSize ?? Math.max(12, Math.floor(size * 0.42));

  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: avatarUrl ? '#eee' : 'var(--brand-gradient)',
    color: '#fff',
    fontWeight: 700,
    fontSize: computedFontSize,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    ...style,
  };

  if (avatarUrl) {
    const src = avatarUrl.startsWith('http')
      ? avatarUrl
      : `${API_BASE_URL}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`;
    return (
      <span style={baseStyle} aria-label={`${label} 头像`}>
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </span>
    );
  }

  return (
    <span style={baseStyle} aria-label={`${label} 头像`}>
      {initial}
    </span>
  );
}
