'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 弹窗标题（可选）；传入后会渲染一个统一的标题行 */
  title?: ReactNode;
  /** 标题下的副文本/说明（可选） */
  description?: ReactNode;
  /** 底部操作区（通常是一组按钮）；不传则隐藏 footer */
  footer?: ReactNode;
  /** 主体内容 */
  children?: ReactNode;
  /** 弹窗最大宽度，默认 420px，确认类弹窗建议 380 */
  maxWidth?: number;
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnBackdrop?: boolean;
  /** 是否禁用 Esc 键关闭，默认允许 */
  disableEscape?: boolean;
  /** 自定义内层容器 z-index（默认 400，优于 Header 的 100/200） */
  zIndex?: number;
  /** 可选的 className 钩子，便于按需扩展样式 */
  className?: string;
  /** 弹窗内容的额外 style（例如去掉默认 padding） */
  contentStyle?: CSSProperties;
};

/**
 * 全局统一弹窗：
 * - 使用 createPortal 渲染到 document.body，避免被父级 `backdrop-filter / transform`
 *   生成的 containing block 截断（如 `.glass` 菜单、`<header>`）。
 * - 提供一致的遮罩、圆角、阴影、标题/描述/底部结构，保证整站交互手感一致。
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  maxWidth = 420,
  closeOnBackdrop = true,
  disableEscape = false,
  zIndex = 400,
  className,
  contentStyle,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || disableEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, disableEscape, onClose]);

  useEffect(() => {
    if (!open) return;
    // 打开时锁滚动，避免背景跟随滚动
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open || typeof document === 'undefined') return null;

  const node = (
    <div
      role="presentation"
      onClick={() => {
        if (closeOnBackdrop) onClose();
      }}
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`modal-content${className ? ` ${className}` : ''}`}
        style={{
          background: '#fff',
          borderRadius: 'var(--radius-lg)',
          maxWidth,
          width: '100%',
          padding: 24,
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border)',
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxSizing: 'border-box',
          ...contentStyle,
        }}
      >
        {title ? (
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4 }}>
            {title}
          </div>
        ) : null}
        {description ? (
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
            {description}
          </div>
        ) : null}
        {children}
        {footer ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              marginTop: 4,
              flexWrap: 'wrap',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
