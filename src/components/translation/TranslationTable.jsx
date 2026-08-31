import React, { memo, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import TranslationRow from './TranslationRow';
import EmptyState from '../EmptyState';
import { SkeletonTable } from '../Skeleton';
import Pagination from '../Pagination';

function SortHeader({ field, label, currentField, currentDir, onSort, className, style }) {
  const isActive = currentField === field;
  return (
    <th
      className={className}
      style={{ cursor: 'pointer', userSelect: 'none', ...style }}
      onClick={() => onSort(field)}
      title={
        // M9: 前端排序只作用于当前页数据（服务端分页），明确提示用户边界
        isActive
          ? (currentDir === 'asc' ? '当前：升序 (点击切换为降序) · 仅当前页内排序' : '当前：降序 (点击恢复默认排序) · 仅当前页内排序')
          : `点击按 ${label} 排序（仅当前页内排序）`
      }
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: style?.textAlign === 'center' ? 'center' : 'flex-start', gap: '4px', width: '100%' }}>
        <span>{label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {isActive ? (
            currentDir === 'asc' ? (
              <ArrowUp size={12} style={{ color: 'var(--accent)' }} />
            ) : (
              <ArrowDown size={12} style={{ color: 'var(--accent)' }} />
            )
          ) : (
            <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
          )}
        </span>
      </div>
    </th>
  );
}

const TranslationTable = memo(function TranslationTable({
  loading,
  records = [],
  paginatedRecords = [],
  totalRecords = 0,
  safePage = 1,
  pageSize = 50,
  setCurrentPage,
  setPageSize,
  selectedRecordIds,
  onSelectAll,
  onToggleSelectRow,
  targetLanguages = [],
  visibleLanguages = [],
  hiddenBaseColumns = new Set(),
  modifiedCells = {},
  lockLoadingId = '',
  onToggleRowLock,
  currentUserRole = '',
  projectRole = 'viewer',
  getRecordValueByName,
  getRecordValue,
  fieldMap = {},
  onEditClick,
  sortField = null,
  sortDirection = null,
  onToggleSort = () => {}
}) {
  // useMemo：全选态判断只依赖当前页记录与选中集，避免无关重渲染重复遍历
  const isAllSelected = useMemo(
    () => paginatedRecords.length > 0 && paginatedRecords.every(r => selectedRecordIds.has(r.recordId || r.id)),
    [paginatedRecords, selectedRecordIds]
  );

  if (loading) {
    return <SkeletonTable rows={10} cols={6} />;
  }

  if (records.length === 0) {
    return (
      <div style={{ padding: '3rem 1rem' }}>
        <EmptyState
          title="暂无对应词条记录"
          description="未能查找到符合当前搜索及筛选条件的翻译词条数据"
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="grid-container" style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '38px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => onSelectAll(e.target.checked)}
                />
              </th>
              <SortHeader
                field="index"
                label="#"
                currentField={sortField}
                currentDir={sortDirection}
                onSort={onToggleSort}
                style={{ width: '50px', textAlign: 'center' }}
              />
              <SortHeader
                field="status"
                label="状态"
                currentField={sortField}
                currentDir={sortDirection}
                onSort={onToggleSort}
                style={{ width: '80px', textAlign: 'center' }}
              />
              <SortHeader
                field="KW"
                label="KW (键名)"
                currentField={sortField}
                currentDir={sortDirection}
                onSort={onToggleSort}
                className="sticky-col-1"
              />
              <SortHeader
                field="CN（中文）"
                label="CN (中文)"
                currentField={sortField}
                currentDir={sortDirection}
                onSort={onToggleSort}
                className="sticky-col-2"
              />
              {!hiddenBaseColumns.has('所在页面') && (
                <SortHeader
                  field="所在页面"
                  label="所在页面"
                  currentField={sortField}
                  currentDir={sortDirection}
                  onSort={onToggleSort}
                />
              )}
              {!hiddenBaseColumns.has('字号类别') && (
                <SortHeader
                  field="字号类别"
                  label="字号/负责人"
                  currentField={sortField}
                  currentDir={sortDirection}
                  onSort={onToggleSort}
                />
              )}
              <SortHeader
                field="progress"
                label="翻译进度"
                currentField={sortField}
                currentDir={sortDirection}
                onSort={onToggleSort}
                style={{ textAlign: 'center', width: '95px' }}
              />
              {targetLanguages.map(lang => {
                if (!visibleLanguages.includes(lang)) return null;
                return (
                  <SortHeader
                    key={lang}
                    field={lang}
                    label={lang}
                    currentField={sortField}
                    currentDir={sortDirection}
                    onSort={onToggleSort}
                  />
                );
              })}
              <th style={{ width: '50px', textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRecords.map((rec, idx) => {
              const recId = rec.recordId || rec.id;
              const isSelected = selectedRecordIds.has(recId);
              const isLocked = rec.isLocked === 1 || rec.isLocked === true;
              const kw = getRecordValueByName(rec, 'KW');
              const zh = getRecordValueByName(rec, 'CN（中文）') || getRecordValue(rec, fieldMap['CN']);
              const page = getRecordValueByName(rec, '所在页面');
              const owner = getRecordValueByName(rec, '字号类别') || getRecordValueByName(rec, '负责人');
              const rowModified = modifiedCells[recId] || {};

              return (
                <TranslationRow
                  key={recId}
                  rec={rec}
                  index={idx}
                  safePage={safePage}
                  pageSize={pageSize}
                  isSelected={isSelected}
                  onToggleSelect={onToggleSelectRow}
                  isLocked={isLocked}
                  lockLoadingId={lockLoadingId}
                  onToggleLock={onToggleRowLock}
                  currentUserRole={currentUserRole}
                  projectRole={projectRole}
                  kw={kw}
                  zh={zh}
                  page={page}
                  owner={owner}
                  rowModified={rowModified}
                  targetLanguages={targetLanguages}
                  visibleLanguages={visibleLanguages}
                  hiddenBaseColumns={hiddenBaseColumns}
                  getRecordValueByName={getRecordValueByName}
                  onEditClick={onEditClick}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fixed Footer Pagination */}
      <Pagination
        total={totalRecords}
        page={safePage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        extra={
          <>
            {selectedRecordIds.size > 0 && (
              <> · 已选 <strong style={{ color: 'var(--accent)' }}>{selectedRecordIds.size}</strong> 条</>
            )}
            {sortField && (
              <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                · 按 <strong style={{ color: 'var(--accent)' }}>{sortField}</strong> {sortDirection === 'asc' ? '升序' : '降序'}排序中（仅当前页内排序，不影响导出）
              </span>
            )}
          </>
        }
      />
    </div>
  );
});

export default TranslationTable;
