'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { apiFetch } from '../lib/http';
import { getTokens } from '../lib/token';
import Modal from './Modal';

type TargetType = 'post' | 'comment' | 'user';

type Props = {
  targetType: TargetType;
  targetId: string;
  /** 触发按钮的视觉变体：inline 用于评论行内；link 用于菜单项/按钮 */
  variant?: 'inline' | 'link';
  label?: string;
  style?: CSSProperties;
  className?: string;
  onReported?: () => void;
};

const REASON_MAX = 200;

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: '请先登录再举报',
  invalid_target_type: '不支持的举报类型',
  missing_target_id: '参数缺失',
  missing_reason: '请填写举报理由',
  reason_too_long: `理由最多 ${REASON_MAX} 字`,
  cannot_report_self: '不能举报自己',
  target_not_found: '目标已不存在',
  already_reported: '你已提交过对该内容的举报',
};

export default function ReportButton({
  targetType,
  targetId,
  variant = 'link',
  label = '举报',
  style,
  className,
  onReported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason('');
      setError(null);
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  const handleOpen = () => {
    const token = getTokens()?.accessToken;
    if (!token) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('请填写举报理由');
      return;
    }
    if (trimmed.length > REASON_MAX) {
      setError(`理由最多 ${REASON_MAX} 字`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/social/reports', {
        method: 'POST',
        body: { targetType, targetId, reason: trimmed },
      });
      setSuccess(true);
      onReported?.();
      setTimeout(() => setOpen(false), 900);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'report_failed';
      setError(ERROR_MESSAGES[code] || '举报失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const triggerStyle: CSSProperties =
    variant === 'inline'
      ? {
          border: 'none',
          background: 'transparent',
          color: 'var(--fg-muted)',
          fontSize: 12,
          cursor: 'pointer',
          padding: 0,
          ...style,
        }
      : {
          border: 'none',
          background: 'transparent',
          color: 'var(--danger)',
          fontSize: 13,
          cursor: 'pointer',
          padding: '6px 0',
          textAlign: 'left',
          ...style,
        };

  const modalTitle =
    targetType === 'post' ? '举报帖子' : targetType === 'comment' ? '举报评论' : '举报用户';

  return (
    <>
      <button type="button" onClick={handleOpen} className={className} style={triggerStyle}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => {
          if (!submitting) setOpen(false);
        }}
        title={modalTitle}
        description="请简述违规原因（如垃圾信息、骚扰、违法等），便于管理员快速判断。"
        maxWidth={420}
        closeOnBackdrop={!submitting}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="btn-secondary"
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: '#fff',
                fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || success}
              className="btn-danger"
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: submitting || success ? 'var(--fg-subtle)' : 'var(--danger)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: submitting || success ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? '提交中...' : success ? '已提交' : '提交举报'}
            </button>
          </>
        }
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={submitting || success}
          maxLength={REASON_MAX}
          rows={4}
          placeholder="举报理由（必填，≤ 200 字）"
          style={{
            width: '100%',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            padding: '10px 12px',
            fontSize: 14,
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            color: 'var(--fg)',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--fg-muted)',
          }}
        >
          <span>
            {reason.length} / {REASON_MAX}
          </span>
          {error ? <span style={{ color: 'var(--danger)' }}>{error}</span> : null}
          {success ? (
            <span style={{ color: 'var(--success)' }}>已提交，等待管理员审核</span>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
