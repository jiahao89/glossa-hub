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
  sortBy = 'default',
  setSortBy = () => {},
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
  onExportCSV,
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
    <div className="toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
      {/* Tier 1: Table Version Selector + Search & Filter Hub */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.65rem' }}>
        {/* Left: Table selector with badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>数据表版本:</span>
          <select 
            value={selectedTableId} 
            onChange={(e) => setSelectedTableId(e.target.value)}
            className="select-input"
            style={{ height: '34px', fontSize: '0.82rem', minWidth: '150px', maxWidth: '220px', fontWeight: 500 }}
            disabled={tables.length === 0}
          >
            {tables.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
            共 {totalRecords} 条
          </span>
        </div>

        {/* Right: Search, Status, Sort & Untranslated in a clean unified group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '320px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px', minWidth: '180px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="text-input"
              style={{ paddingLeft: '32px', width: '100%', height: '34px', fontSize: '0.82rem' }}
              placeholder="搜索 KW、中文或任意语种译文..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* Status filter */}
          <select
            className="select-input"
            style={{ height: '34px', fontSize: '0.82rem', width: 'auto', minWidth: '115px' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">全部审核状态</option>
            <option value="DRAFT">待审核 (DRAFT)</option>
            <option value="APPROVED">已审核 (APPROVED)</option>
            <option value="PUBLISHED">已发布 (PUBLISHED)</option>
            <option value="REJECTED">已驳回 (REJECTED)</option>
          </select>

          {/* Sort order filter */}
          <select
            className="select-input"
            style={{ height: '34px', fontSize: '0.82rem', width: 'auto', minWidth: '145px' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            title="选择词条排序与查看方式"
          >
            <option value="default">默认顺序 (原有顺序)</option>
            <option value="updated_at">🕒 按更新时间 (最新变动)</option>
            <option value="created_at">✨ 按新增时间 (最新录入)</option>
            <option value="kw">🔤 按 KW 键名 (A-Z)</option>
            <option value="zh_cn">🔤 按 中文源词 (A-Z)</option>
          </select>

          {/* Untranslated toggle button */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', height: '34px', padding: '0 0.6rem', background: filterUntranslated ? 'var(--accent-light, rgba(59, 130, 246, 0.1))' : 'var(--bg-primary)', border: `1px solid ${filterUntranslated ? 'var(--accent)' : 'var(--border-color)'}`, borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: filterUntranslated ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', transition: 'all 0.15s' }}>
            <input
              type="checkbox"
              checked={filterUntranslated}
              onChange={(e) => setFilterUntranslated(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span>仅看未译</span>
          </label>
        </div>
      </div>

      {/* Tier 2: Action & Operation Hub */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.3rem', borderTop: '1px dashed var(--border-color)' }}>
        {/* Left: Columns & Import / Export Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {/* Columns Selector Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ height: '32px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
              onClick={() => setColDropdownOpen(!colDropdownOpen)}
            >
              <Settings size={13} />
              <span>显示列 ({visibleLanguages.length}/{targetLanguages.length})</span>
            </button>

            {colDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
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

          <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 0.15rem' }} />

          <button className="btn btn-secondary btn-sm" style={{ height: '32px', fontSize: '0.8rem' }} onClick={onExportXLS} title="导出当前表数据为 Excel (.xlsx)">
            <FileOutput size={13} />
            <span>导出 XLS</span>
          </button>

          <button className="btn btn-secondary btn-sm" style={{ height: '32px', fontSize: '0.8rem' }} onClick={onExportCSV} title="导出当前表数据为 CSV 文件（不含所在页面与字号类别）">
            <FileOutput size={13} />
            <span>导出 CSV</span>
          </button>

          {projectRole !== 'viewer' && csvImportNode}
        </div>

        {/* Right: Selection Bar OR Batch Operations & Primary Add Term Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {selectedCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 0.3rem' }}>
                已选 <strong style={{ color: 'var(--accent)' }}>{selectedCount}</strong> 项
              </span>
              
              <button className="btn-text btn-sm" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }} onClick={onClearSelection}>
                取消
              </button>

              <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 0.1rem' }} />

              {/* 复制表格内容 */}
              <button
                className="btn btn-secondary btn-sm"
                style={{ height: '28px', borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: '0.78rem' }}
                onClick={onCopyContent}
                title="自定义复制选中行到剪贴板，支持选择复制列、反选，方便直接粘贴至 CSV / XLS / 表格中"
              >
                <ClipboardCopy size={13} />
                <span>复制内容</span>
              </button>

              {projectRole !== 'viewer' && (
                <>
                  <button className="btn btn-secondary btn-sm" style={{ height: '28px', fontSize: '0.78rem' }} onClick={onBatchApprove}>
                    <CheckCircle size={13} style={{ color: 'var(--green)' }} />
                    <span>批量审核</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '28px', fontSize: '0.78rem' }} onClick={onBatchCategory}>
                    <Layers size={13} />
                    <span>分类</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '28px', fontSize: '0.78rem' }} onClick={onBatchCopy}>
                    <Copy size={13} />
                    <span>复制到表</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '28px', fontSize: '0.78rem' }} onClick={onBatchLock} title="锁定选中的词条只读">
                    <Lock size={13} style={{ color: 'var(--red)' }} />
                    <span>锁定</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '28px', fontSize: '0.78rem' }} onClick={onBatchUnlock} title="解锁选中的词条">
                    <Unlock size={13} />
                    <span>解锁</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ height: '28px', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--red)', fontSize: '0.78rem' }}
                    onClick={onBatchDelete}
                    title="将选中的词条送入回收站 (30 天内可恢复)"
                  >
                    <Trash2 size={13} />
                    <span>删除</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {modifiedCount > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ height: '32px', color: 'var(--yellow)', fontSize: '0.8rem' }}
                  onClick={onClearHighlights}
                  title="清除页面改动标记高亮"
                >
                  <Eraser size={13} />
                  <span>清除标记 ({modifiedCount})</span>
                </button>
              )}

              {projectRole !== 'viewer' && (
                <>
                  <button className="btn btn-secondary btn-sm" style={{ height: '32px', fontSize: '0.8rem' }} onClick={onDataClean} title="清除无 KW 或无中文的空记录">
                    <Trash2 size={13} />
                    <span>数据清理</span>
                  </button>

                  <button className="btn btn-secondary btn-sm" style={{ height: '32px', fontSize: '0.8rem' }} onClick={onBatchAdd} title="手动批量新增词条">
                    <Layers size={13} />
                    <span>批量新增</span>
                  </button>

                  {onInherit && tables.length > 1 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ height: '32px', fontSize: '0.8rem' }}
                      onClick={onInherit}
                      title="从其他大表继承补全未翻译的 cell (跳过已锁定词条)"
                    >
                      <Layers size={13} style={{ color: 'var(--accent)' }} />
                      <span>继承翻译</span>
                    </button>
                  )}

                  {difyConfigured && (
                    <button className="btn btn-secondary btn-sm" style={{ height: '32px', fontSize: '0.8rem' }} onClick={onBatchTranslate} title="调用 Dify 批量翻译 (无选中时扫描全部)">
                      <Bot size={13} style={{ color: 'var(--purple)' }} />
                      <span>批量 AI 翻译</span>
                    </button>
                  )}

                  <button className="btn btn-primary btn-sm" style={{ height: '32px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.85rem' }} onClick={onAddTerm}>
                    <Plus size={14} />
                    <span>新增词条</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
