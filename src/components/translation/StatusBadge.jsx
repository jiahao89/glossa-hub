import React from 'react';

// ============================================================
// StatusBadge — 统一表格状态徽章
//
// 取代 TranslationRow.jsx 里 30+ 行的内联三元表达式。
// 用 tone 区分语义,颜色走 CSS 主题变量,亮暗模式自适应。
//
// 用法：
//   <StatusBadge status={rec.status} rejectReason={rec.rejectReason} />
// ============================================================

const STATUS_CONFIG = {
  DRAFT:          { label: '待审核', tone: 'pending' },
  PENDING_REVIEW: { label: '待审核', tone: 'pending' },
  TRANSLATING:    { label: '待审核', tone: 'pending' },
  APPROVED:       { label: '已审核', tone: 'success' },
  REJECTED:       { label: '已驳回', tone: 'danger' },
  PUBLISHED:      { label: '已发布', tone: 'info' },
};

export default function StatusBadge({ status, rejectReason }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  return (
    <span
      className={`status-badge status-badge-${config.tone}`}
      title={config.tone === 'danger' ? (rejectReason || config.label) : config.label}
    >
      {config.label}
    </span>
  );
}