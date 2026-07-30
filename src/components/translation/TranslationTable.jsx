import React from 'react';
import TranslationRow from './TranslationRow';
import EmptyState from '../EmptyState';
import { SkeletonTable } from '../Skeleton';
import Pagination from '../Pagination';

export default function TranslationTable({
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
  modifiedCells = {},
  lockLoadingId = '',
  onToggleRowLock,
  currentUserRole = '',
  projectRole = 'viewer',
  getRecordValueByName,
  getRecordValue,
  fieldMap = {},
  onEditClick
}) {
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

  const isAllSelected = paginatedRecords.length > 0 && paginatedRecords.every(r => selectedRecordIds.has(r.recordId || r.id));

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
              <th style={{ width: '45px', textAlign: 'center' }}>#</th>
              <th style={{ width: '70px', textAlign: 'center' }}>状态</th>
              <th className="sticky-col-1">KW (键名)</th>
              <th className="sticky-col-2">CN (中文)</th>
              <th>所在页面</th>
              <th>字号/负责人</th>
              <th style={{ textAlign: 'center', width: '90px' }}>翻译进度</th>
              {targetLanguages.map(lang => {
                if (!visibleLanguages.includes(lang)) return null;
                return <th key={lang}>{lang}</th>;
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
        extra={selectedRecordIds.size > 0 ? (
          <> · 已选 <strong style={{ color: 'var(--accent)' }}>{selectedRecordIds.size}</strong> 条</>
        ) : null}
      />
    </div>
  );
}
