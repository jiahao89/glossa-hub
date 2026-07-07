import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

// ============================================================
// 全局 Toast 通知组件
// 替代原有 alert() 弹窗，提供更轻量的非阻塞反馈
// 用法：
//   const toast = useToast();
//   toast.success('保存成功');
//   toast.error('保存失败：xxx');
//   toast.info('提示信息');
// ============================================================

const ToastContext = createContext(null);

// eslint-disable-next-line react/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 容错：在 Provider 之外调用时退化为 console，避免崩溃
    console.warn('[Toast] useToast 必须在 ToastProvider 内调用');
    return {
      success: (m) => console.log('[Toast.success]', m),
      error: (m) => console.error('[Toast.error]', m),
      info: (m) => console.info('[Toast.info]', m),
    };
  }
  return ctx;
}

let _idCounter = 0;
const AUTO_DISMISS_MS = {
  success: 2500,
  info: 3000,
  error: 5000, // 错误信息给更长时间让用户阅读
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message) => {
    const id = ++_idCounter;
    setToasts((list) => [...list, { id, type, message }]);
    const timeout = AUTO_DISMISS_MS[type] || 3000;
    setTimeout(() => dismiss(id), timeout);
    return id;
  }, [dismiss]);

  const toast = {
    success: useCallback((m) => push('success', m), [push]),
    error: useCallback((m) => push('error', m), [push]),
    info: useCallback((m) => push('info', m), [push]),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast 渲染容器：固定在右上角，避免遮挡内容 */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  const config = {
    success: { icon: CheckCircle2, bg: 'var(--green)', label: '成功' },
    error: { icon: AlertCircle, bg: 'var(--red)', label: '错误' },
    info: { icon: Info, bg: 'var(--accent)', label: '提示' },
  };
  const { icon: Icon, bg } = config[toast.type] || config.info;

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        minWidth: '300px',
        maxWidth: '480px',
        padding: '12px 14px',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: `4px solid ${bg}`,
        border: '1px solid var(--border-color)',
        borderLeftWidth: '4px',
        borderLeftColor: bg,
        borderRadius: '6px',
        boxShadow: 'var(--shadow-lg), 0 0 0 1px var(--border-color)',
        fontSize: '0.875rem',
        color: 'var(--text-primary)',
        pointerEvents: 'auto',
        animation: 'toast-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <Icon size={18} color={bg} style={{ flexShrink: 0, marginTop: '1px' }} />
      <div style={{ flex: 1, wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
        {toast.message}
      </div>
      <button
        onClick={onClose}
        aria-label="关闭"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          color: 'var(--text-muted)',
          flexShrink: 0,
          borderRadius: '4px',
          transition: 'color 0.15s, background-color 0.15s',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

// 默认导出 hook，方便快速调用
// eslint-disable-next-line react/only-export-components
export default useToast;
