import React from 'react';

// ============================================================
// 通用分页器组件（词条管理 / 专业词汇库共用，保证样式一致）
// 用法：
//   <Pagination
//     total={filteredRecords.length}
//     page={currentPage}
//     pageSize={pageSize}
//     onPageChange={setCurrentPage}
//     onPageSizeChange={setPageSize}   // 可选，传入则显示“每页条数”选择器
//     pageSizeOptions={[20, 50, 100, 200]}  // 可选，默认 [20,50,100,200]
//     extra={<span>已选 N 条</span>}  // 可选，左侧附加信息
//   />
// ============================================================

export default function Pagination({
  total = 0,
  page = 1,
  pageSize = 50,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100, 200],
  extra = null,
}) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const btnStyle = (disabled) => ({
    height: '28px',
    padding: '0 0.6rem',
    fontSize: '0.78rem',
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.6rem 1rem',
        borderTop: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
        fontSize: '0.82rem',
        color: 'var(--text-secondary)',
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        共 <strong style={{ color: 'var(--text-primary)' }}>{total}</strong> 条
        {totalPages > 1 && (
          <>
            {' '}· 第 <strong style={{ color: 'var(--text-primary)' }}>{safePage}</strong> / {totalPages} 页
          </>
        )}
        {extra}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {onPageSizeChange && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginRight: '0.3rem' }}>
            每页
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                height: '26px',
                padding: '0 0.3rem',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            条
          </span>
        )}
        <button
          onClick={() => onPageChange && onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          className="btn btn-secondary"
          style={btnStyle(safePage <= 1)}
        >
          上一页
        </button>
        <span
          style={{
            minWidth: '32px',
            textAlign: 'center',
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {safePage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange && onPageChange(Math.min(totalPages, safePage + 1))}
          disabled={safePage >= totalPages}
          className="btn btn-secondary"
          style={btnStyle(safePage >= totalPages)}
        >
          下一页
        </button>
        {totalPages > 3 && (
          <span style={{ marginLeft: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            跳至
            <input
              type="number"
              min={1}
              max={totalPages}
              value={safePage}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && onPageChange) {
                  onPageChange(Math.max(1, Math.min(totalPages, v)));
                }
              }}
              style={{
                width: '52px',
                height: '28px',
                padding: '0 0.4rem',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '0.78rem',
                textAlign: 'center',
              }}
            />
            页
          </span>
        )}
      </div>
    </div>
  );
}
