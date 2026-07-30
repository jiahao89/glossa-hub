import React from 'react';
import { Search, Plus, FileInput, FileOutput, Layers, Lock, Unlock, CheckCircle, Bot, Eraser, Settings, Copy } from 'lucide-react';

export default function TranslationToolbar({
  tables = [],
  selectedTableId,
  setSelectedTableId,
  totalRecords = 0,
  searchInput,
  setSearchInput,
  filterUntranslated,
  setFilterUntranslated,
  filterStatus,
  setFilterStatus,
  colDropdownOpen,
  setColDropdownOpen,
  targetLanguages = [],
  visibleLanguages = [],
  setVisibleLanguages,
  selectedCount = 0,
  onClearSelection,
  onBatchTranslate,
  onBatchApprove,
  onBatchCategory,
  onBatchCopy,
  onBatchLock,
  onBatchUnlock,
  onExportXLS,
  onImportCSV,
  onAddTerm,
  onClearHighlights,
  modifiedCount = 0,
  projectRole = 'viewer',
  difyConfigured = false
}) {
  return (
    <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.8rem 1rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
      {/* Top row: search & primary filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
        {/* Table Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>数据表版本:</span>
          <select 
            value={selectedTableId} 
            onChange={(e) => setSelectedTableId(e.target.value)}
            className="select-input"
            style={{ height: '32px', fontSize: '0.82rem', minWidth: '140px', maxWidth: '200px' }}
            disabled={tables.length === 0}
          >
            {tables.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            (共 {totalRecords} 条)
          </span>
        </div>

        {/* Search & Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="text-input"
              style={{ paddingLeft: '32px', width: '100%', height: '32px', fontSize: '0.85rem' }}
              placeholder="搜索 KW、中文或任意语种译文..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <select
            className="select-input"
            style={{ height: '32px', fontSize: '0.82rem' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">全部审核状态</option>
            <option value="DRAFT">待审核 (DRAFT / PENDING)</option>
            <option value="APPROVED">已审核 (APPROVED)</option>
            <option value="PUBLISHED">已发布 (PUBLISHED)</option>
            <option value="REJECTED">已驳回 (REJECTED)</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={filterUntranslated}
              onChange={(e) => setFilterUntranslated(e.target.checked)}
            />
            <span>仅看未译</span>
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Columns Selector Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ height: '32px' }}
              onClick={() => setColDropdownOpen(!colDropdownOpen)}
            >
              <Settings size={14} />
              <span>显示列 ({visibleLanguages.length}/{targetLanguages.length})</span>
            </button>

            {colDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '36px',
                  zIndex: 100,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '0.8rem',
                  minWidth: '200px',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', fontWeight: 600 }}>
                  <span>选择显示语种列</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="btn-text"
                      style={{ fontSize: '0.75rem', color: 'var(--accent)' }}
                      onClick={() => setVisibleLanguages([...targetLanguages])}
                    >
                      全选
                    </button>
                    <button
                      className="btn-text"
                      style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                      onClick={() => setVisibleLanguages([])}
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {targetLanguages.map(lang => (
                    <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={visibleLanguages.includes(lang)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVisibleLanguages([...visibleLanguages, lang]);
                          } else {
                            setVisibleLanguages(visibleLanguages.filter(l => l !== lang));
                          }
                        }}
                      />
                      <span>{lang}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Clear highlights if modified */}
          {modifiedCount > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ height: '32px', color: 'var(--yellow)' }}
              onClick={onClearHighlights}
              title="清除页面改动标记高亮"
            >
              <Eraser size={14} />
              <span>清除标记 ({modifiedCount})</span>
            </button>
          )}

          {/* Import / Export */}
          <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onExportXLS} title="导出当前表数据为 Excel (.xlsx)">
            <FileOutput size={14} />
            <span>导出 XLS</span>
          </button>

          {projectRole !== 'viewer' && (
            <>
              <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onImportCSV} title="导入增量 CSV 文件">
                <FileInput size={14} />
                <span>导入 CSV</span>
              </button>

              <button className="btn btn-primary btn-sm" style={{ height: '32px' }} onClick={onAddTerm}>
                <Plus size={14} />
                <span>新增词条</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom row: Batch action bar (when rows selected) */}
      {selectedCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            padding: '0.4rem 0.8rem',
            background: 'var(--bg-primary)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.82rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span>已选中 <strong style={{ color: 'var(--accent)' }}>{selectedCount}</strong> 项</span>
            <button className="btn-text" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }} onClick={onClearSelection}>
              取消选中
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {difyConfigured && (
              <button className="btn btn-secondary btn-sm" onClick={onBatchTranslate} title="调用 Dify 批量 AI 翻译选中的词条">
                <Bot size={13} style={{ color: 'var(--purple)' }} />
                <span>批量 AI 翻译</span>
              </button>
            )}

            {projectRole !== 'viewer' && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={onBatchApprove}>
                  <CheckCircle size={13} style={{ color: 'var(--green)' }} />
                  <span>批量审核</span>
                </button>

                <button className="btn btn-secondary btn-sm" onClick={onBatchCategory}>
                  <Layers size={13} />
                  <span>设置分类</span>
                </button>

                <button className="btn btn-secondary btn-sm" onClick={onBatchCopy}>
                  <Copy size={13} />
                  <span>复制到其他表</span>
                </button>

                <button className="btn btn-secondary btn-sm" onClick={onBatchLock} title="锁定选中的词条只读">
                  <Lock size={13} style={{ color: 'var(--red)' }} />
                  <span>锁定</span>
                </button>

                <button className="btn btn-secondary btn-sm" onClick={onBatchUnlock} title="解锁选中的词条">
                  <Unlock size={13} />
                  <span>解锁</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
