import React, { useEffect, useRef, useCallback } from 'react';

// ============================================================
// 统一模态框组件 — 基于 HeroUI Modal 设计理念的轻量实现
//
// 解决项目中 16 处模态框的以下不一致性：
//   - 2 套 DOM 模式（语义化 class vs 内联 card）统一为 1 个 API
//   - 12/16 处缺少 aria-label，现自动添加
//   - backdrop 内联样式与 CSS 重复，现统一使用 CSS 类
//   - 关闭按钮 class 不统一（close-btn vs modal-close），现统一
//
// 新增可访问性特性：
//   - ESC 键关闭
//   - 点击 backdrop 关闭（可选）
//   - 打开时自动聚焦对话框容器
//   - role="dialog" + aria-modal="true" + aria-labelledby
//
// 用法：
//   <GlossaModal
//     isOpen={modalOpen}
//     onClose={() => setModalOpen(false)}
//     title="编辑词条"
//     maxWidth="800px"
//     footer={<><button>取消</button><button>保存</button></>}
//   >
//     {/* modal-body 内容 */}
//   </GlossaModal>
//
//   // 简化模式（无 header/footer 分区，适合表单弹窗）：
//   <GlossaModal
//     isOpen={addOpen}
//     onClose={() => setAddOpen(false)}
//     variant="simple"
//     width="400px"
//   >
//     <h3>新建</h3>
//     <form>...</form>
//   </GlossaModal>
// ============================================================

let _modalIdCounter = 0;

export default function GlossaModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth,
  width,
  variant = 'standard',  // 'standard' | 'simple'
  dismissOnBackdrop = true,
  closeDisabled = false,
}) {
  const dialogRef = useRef(null);
  const idRef = useRef(null);

  // 生成稳定的 title ID（用于 aria-labelledby）
  if (!idRef.current) {
    idRef.current = `glossa-modal-title-${++_modalIdCounter}`;
  }

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !closeDisabled) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, closeDisabled]);

  // 打开时自动聚焦对话框
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  // 打开时锁定 body 滚动
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback((e) => {
    if (dismissOnBackdrop && e.target === e.currentTarget && !closeDisabled) {
      onClose();
    }
  }, [dismissOnBackdrop, onClose, closeDisabled]);

  if (!isOpen) return null;

  const contentStyle = variant === 'simple'
    ? { width: width || '400px', padding: '1.5rem', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }
    : { maxWidth: maxWidth || width, ...(width && { width }) };

  return (
    <div
      className={variant === 'simple' ? 'modal-backdrop flex-center' : 'modal-backdrop'}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={variant === 'simple' ? 'card' : 'modal-content'}
        style={contentStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? idRef.current : undefined}
        tabIndex={-1}
      >
        {variant === 'standard' ? (
          <>
            <div className="modal-header">
              {title && <h3 className="modal-title" id={idRef.current} style={{ margin: 0 }}>{title}</h3>}
              <button
                className="close-btn"
                onClick={onClose}
                disabled={closeDisabled}
                aria-label="关闭"
                style={closeDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              {children}
            </div>
            {footer && (
              <div className="modal-footer">
                {footer}
              </div>
            )}
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
