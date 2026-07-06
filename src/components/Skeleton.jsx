import React from 'react';

// ============================================================
// 通用骨架屏组件（替代 spinner，减少 Layout Shift）
// 用法：
//   <Skeleton width="120px" height={14} />            // 单条
//   <Skeleton count={5} height={12} />                // 多行
//   <Skeleton variant="circle" width={32} height={32} /> // 圆形
//   <SkeletonText lines={3} />                        // 段落文本
// ============================================================

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 4,
  count = 1,
  variant = 'rect', // 'rect' | 'circle'
  style: extraStyle = {},
}) {
  const items = Array.from({ length: count });
  const baseStyle = {
    width,
    height,
    borderRadius: variant === 'circle' ? '50%' : radius,
    background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
    flexShrink: 0,
    ...extraStyle,
  };
  if (count === 1) return <div style={baseStyle} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {items.map((_, i) => <div key={i} style={baseStyle} />)}
    </div>
  );
}

// 段落文本骨架：首行稍短，其余满宽
export function SkeletonText({ lines = 3, lineHeight = 12, gap = 8, width = '100%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px`, width }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

// 表格骨架：rows 行 × cols 列
export function SkeletonTable({ rows = 8, cols = 6 }) {
  return (
    <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} style={{ padding: '0.6rem 0.75rem' }}>
              <Skeleton width="60%" height={12} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r} style={{ borderBottom: '1px solid var(--border-color)' }}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c} style={{ padding: '0.6rem 0.75rem' }}>
                <Skeleton width={c === 0 ? '40%' : '80%'} height={12} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 页面级骨架占位（用于 Suspense fallback）
export function SkeletonTab() {
  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Skeleton width="200px" height={28} />
      <Skeleton width="100%" height={36} radius={8} />
      <SkeletonTable rows={10} cols={6} />
    </div>
  );
}

export default Skeleton;
