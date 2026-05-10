import { useState } from 'react';
import { apiPost } from '../../api/client';

interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function SettingsPage() {
  const [oldPassword,     setOldPassword]     = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formState,       setFormState]       = useState<FormState>('idle');
  const [errorMsg,        setErrorMsg]        = useState<string | null>(null);

  const isValid =
    oldPassword.trim().length > 0 &&
    newPassword.trim().length >= 6 &&
    newPassword === confirmPassword;

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const passwordTooShort = newPassword.length > 0 && newPassword.length < 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setFormState('submitting');
    setErrorMsg(null);

    try {
      await apiPost<{ ok: boolean }>('/auth/change-password', {
        oldPassword,
        newPassword,
      } satisfies ChangePasswordPayload);

      setFormState('success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Reset to idle after 3s
      setTimeout(() => setFormState('idle'), 3000);
    } catch (e) {
      setFormState('error');
      setErrorMsg(e instanceof Error ? e.message : '修改失败，请重试');
    }
  };

  const inputCls = `
    w-full font-mono text-sm px-3 py-2.5 rounded-lg
    bg-[var(--c-bg)] border border-[var(--c-border)]
    text-[var(--c-text)] focus:outline-none focus:border-[var(--c-accent)]
    transition-colors
  `.trim();

  const labelCls = 'text-xs font-mono mb-1.5 block tracking-wide';

  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto">
      {/* Header */}
      <h1 className="text-lg font-mono tracking-widest" style={{ color: 'var(--c-text)' }}>
        SETTINGS
      </h1>

      {/* Change password card */}
      <div
        className="rounded-xl p-6 flex flex-col gap-5"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)' }}
      >
        <h2 className="text-xs font-mono tracking-widest" style={{ color: 'var(--c-muted)' }}>
          修改密码
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* Old password */}
          <div>
            <label className={labelCls} style={{ color: 'var(--c-muted)' }}>
              当前密码
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              disabled={formState === 'submitting'}
              className={inputCls}
              placeholder="••••••••"
            />
          </div>

          {/* New password */}
          <div>
            <label className={labelCls} style={{ color: 'var(--c-muted)' }}>
              新密码
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={formState === 'submitting'}
              className={inputCls}
              style={{
                borderColor: passwordTooShort ? 'var(--c-rev)' : undefined,
              }}
              placeholder="至少 6 位"
            />
            {passwordTooShort && (
              <p className="text-xs font-mono mt-1" style={{ color: 'var(--c-rev)' }}>
                密码至少需要 6 位
              </p>
            )}
          </div>

          {/* Confirm new password */}
          <div>
            <label className={labelCls} style={{ color: 'var(--c-muted)' }}>
              确认新密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={formState === 'submitting'}
              className={inputCls}
              style={{
                borderColor: passwordMismatch ? 'var(--c-rev)' : undefined,
              }}
              placeholder="再次输入新密码"
            />
            {passwordMismatch && (
              <p className="text-xs font-mono mt-1" style={{ color: 'var(--c-rev)' }}>
                两次输入的密码不一致
              </p>
            )}
          </div>

          {/* Error message */}
          {formState === 'error' && errorMsg && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid var(--c-rev)',
                color: 'var(--c-rev)',
              }}
            >
              <span>✕</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success message */}
          {formState === 'success' && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono"
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid var(--c-ok)',
                color: 'var(--c-ok)',
              }}
            >
              <span>✓</span>
              <span>密码已成功修改</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={!isValid || formState === 'submitting'}
            className="w-full py-2.5 rounded-lg text-sm font-mono tracking-wider cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: formState === 'success' ? 'var(--c-ok)' : 'var(--c-accent-dim)',
              color:      formState === 'success' ? '#000'        : 'var(--c-accent)',
              border:     `1px solid ${formState === 'success' ? 'var(--c-ok)' : 'var(--c-accent)'}`,
            }}
          >
            {formState === 'submitting'
              ? '提交中…'
              : formState === 'success'
              ? '✓ 已修改'
              : '修改密码'}
          </button>
        </form>
      </div>

      {/* App info */}
      <div
        className="rounded-xl p-4 flex flex-col gap-2 text-xs font-mono"
        style={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', color: 'var(--c-hint)' }}
      >
        <div className="tracking-widest mb-1" style={{ color: 'var(--c-muted)' }}>ABOUT</div>
        <div>ESP Control Platform</div>
        <div>Server: {import.meta.env.VITE_SERVER_API ?? '—'}</div>
      </div>
    </div>
  );
}
