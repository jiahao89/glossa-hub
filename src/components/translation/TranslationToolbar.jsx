import React, { useState } from 'react';
import { Search, Plus, FileOutput, Layers, Lock, Unlock, CheckCircle, Bot, Eraser, Settings, Copy, Trash2, ClipboardCopy } from 'lucide-react';

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
  targetLanguages = [],
  visibleLanguages = [],
  setVisibleLanguages,
  selectedCount = 0,
  onClearSelection,
  onCopyContent,
  onBatchTranslate,
  onBatchApprove,
  onBatchCategory,
  onBatchCopy,
  onBatchLock,
  onBatchUnlock,
  onBatchDelete,
  onExportXLS,
  csvImportNode,
  onAddTerm,
  onBatchAdd,
  onInherit,
  onDataClean,
  onClearHighlights,
  modifiedCount = 0,
  projectRole = 'viewer',
  difyConfigured = false
}) {
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
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

          {/* Selection-specific inline actions (available for both single/batch selection) */}
          {selectedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '0.8rem', marginLeft: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>已选 <strong style={{ color: 'var(--accent)' }}>{selectedCount}</strong> 项</span>
              
              <button className="btn-text btn-sm" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }} onClick={onClearSelection}>
                取消
              </button>

              {/* 复制表格内容 (支持自由选择列/反选/复制到 CSV/Excel) */}
              <button
                className="btn btn-secondary btn-sm"
                style={{ height: '32px', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                onClick={onCopyContent}
                title="自定义复制选中行到剪贴板，支持选择复制列、反选，方便直接粘贴至 CSV / XLS / 表格中"
              >
                <ClipboardCopy size={14} />
                <span>复制内容</span>
              </button>

              {projectRole !== 'viewer' && (
                <>
                  <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onBatchApprove}>
                    <CheckCircle size={14} style={{ color: 'var(--green)' }} />
                    <span>批量审核</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onBatchCategory}>
                    <Layers size={14} />
                    <span>设置分类</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onBatchCopy}>
                    <Copy size={14} />
                    <span>复制到其他表</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onBatchLock} title="锁定选中的词条只读">
                    <Lock size={14} style={{ color: 'var(--red)' }} />
                    <span>锁定</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onBatchUnlock} title="解锁选中的词条">
                    <Unlock size={14} />
                    <span>解锁</span>
                  </button>

                  {/* 批量删除: 走回收站 (30 天可恢复) */}
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ height: '32px', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--red)' }}
                    onClick={onBatchDelete}
                    title="将选中的词条送入回收站 (30 天内可恢复)"
                  >
                    <Trash2 size={14} />
                    <span>删除</span>
                  </button>
                </>
              )}
            </div>
          )}

          {projectRole !== 'viewer' && (
            <>
              <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onDataClean} title="清除无 KW 或无中文的空记录">
                <Trash2 size={14} />
                <span>数据清理</span>
              </button>

              {csvImportNode}

              <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onBatchAdd} title="手动批量新增词条">
                <Layers size={14} />
                <span>批量新增</span>
              </button>

              {/* 从其他大表继承翻译 — v1.2 重构后丢失, 现在恢复 */}
              {onInherit && tables.length > 1 && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ height: '32px' }}
                  onClick={onInherit}
                  title="从其他大表继承补全未翻译的 cell (跳过已锁定词条)"
                >
                  <Layers size={14} style={{ color: 'var(--accent)' }} />
                  <span>继承翻译</span>
                </button>
              )}

              {difyConfigured && (
                <button className="btn btn-secondary btn-sm" style={{ height: '32px' }} onClick={onBatchTranslate} title="调用 Dify 批量翻译 (无选中时扫描全部)">
                  <Bot size={14} style={{ color: 'var(--purple)' }} />
                  <span>批量 AI 翻译</span>
                </button>
              )}

              <button className="btn btn-primary btn-sm" style={{ height: '32px' }} onClick={onAddTerm}>
                <Plus size={14} />
                <span>新增词条</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
