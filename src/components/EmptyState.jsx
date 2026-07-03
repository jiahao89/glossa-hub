import React from 'react';
import { Inbox } from 'lucide-react';

// ============================================================
// 通用空状态组件
// 用法：
//   <EmptyState
//     title="当前版本暂无词条"
//     description="点击右上角“新增词条”按钮，或导入 CSV 创建第一批词条"
//     actionLabel="新增词条"
//     onAction={() => setAddModalOpen(true)}
//   />
// 或仅文案：
//   <EmptyState title="暂无日志" description="开始编辑后，操作记录会显示在这里" />
// ============================================================

export default function EmptyState({
  title = '暂无数据',
  description = '',
  actionLabel = '',
  onAction = null,
  icon: CustomIcon = null,
}) {
  const Icon = CustomIcon || Inbox;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.7,
        }}
      >
        <Icon size={24} color="var(--text-secondary)" />
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-primary)' }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: '0.82rem', maxWidth: '420px', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="btn btn-primary"
          style={{ marginTop: '8px' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
