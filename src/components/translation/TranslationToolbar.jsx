import React, { useState } from 'react';
import { Search, Plus, FileOutput, Layers, Lock, Unlock, CheckCircle, Bot, Eraser, Settings, Copy, Trash2, ClipboardCopy, Filter, Sparkles } from 'lucide-react';

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
  difyConfigured = false,
  baseOptionalColumns = [],
  hiddenBaseColumns = new Set(),
  setHiddenBaseColumns = () => {}
}) {
  const [colDropdownOpen, setColDropdownOpen] = useState(false);

  return (
    <div className="heroui-toolbar-container">
      {/* Tier 1: Workspace Selection & Fast Filter Controls */}
      <div className="heroui-row">
        {/* Left: Table Version Selector & Counter Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            数据表版本:
          </span>
          <select 
            value={selectedTableId} 
            onChange={(e) => setSelectedTableId(e.target.value)}
            className="heroui-input-control"
            style={{ minWidth: '160px', maxWidth: '240px', fontWeight: 500 }}
            disabled={tables.length === 0}
          >
            {tables.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span className="heroui-badge">
            共 {totalRecords} 条
          </span>
        </div>

        {/* Right: Search Input + Status + Sort + Untranslated Chip (single neat line) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '320px', justifyContent: 'flex-end' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px', minWidth: '180px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="heroui-input-control"
              style={{ width: '100%', paddingLeft: '32px' }}
              placeholder="搜索 KW、中文或任意语种译文..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* Status Dropdown */}
          <select
            className="heroui-input-control"
            style={{ width: 'auto', minWidth: '120px' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">全部审核状态</option>
            <option value="DRAFT">待审核 (DRAFT)</option>
            <option value="APPROVED">已审核 (APPROVED)</option>
            <option value="PUBLISHED">已发布 (PUBLISHED)</option>
            <option value="REJECTED">已驳回 (REJECTED)</option>
          </select>

          {/* Sort Dropdown */}
          <select
            className="heroui-input-control"
            style={{ width: 'auto', minWidth: '150px' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            title="选择词条排序方式"
          >
            <option value="default">默认顺序 (原有顺序)</option>
            <option value="updated_at">🕒 按更新时间 (最新变动)</option>
            <option value="created_at">✨ 按新增时间 (最新录入)</option>
            <option value="kw">🔤 按 KW 键名 (A-Z)</option>
            <option value="zh_cn">🔤 按 中文源词 (A-Z)</option>
          </select>

          {/* Untranslated HeroUI Chip */}
          <div
            className={`heroui-chip ${filterUntranslated ? 'active' : ''}`}
            onClick={() => setFilterUntranslated(!filterUntranslated)}
            title="只显示存在未翻译语种的词条"
          >
            <Filter size={13} />
            <span>仅看未译</span>
          </div>
        </div>
      </div>

      {/* Tier 2: View Tools, File Export/Import & Action Operations */}
      <div className="heroui-row" style={{ paddingTop: '0.4rem', borderTop: '1px solid var(--border-color)' }}>
        {/* Left: Columns Selector & Export/Import Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {/* Columns Selector Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="heroui-btn"
              onClick={() => setColDropdownOpen(!colDropdownOpen)}
            >
              <Settings size={14} />
              <span>显示列 ({(baseOptionalColumns.length - hiddenBaseColumns.size) + visibleLanguages.length}/{baseOptionalColumns.length + targetLanguages.length})</span>
            </button>

            {colDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '40px',
                  zIndex: 100,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '0.85rem',
                  minWidth: '220px',
                  maxHeight: '320px',
                  overflowY: 'auto'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem', fontWeight: 600 }}>
                  <span>选择显示列</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn-text"
                      style={{ fontSize: '0.75rem', color: 'var(--accent)' }}
                      onClick={() => { setHiddenBaseColumns(new Set()); setVisibleLanguages([...targetLanguages]); }}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="btn-text"
                      style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                      onClick={() => { setHiddenBaseColumns(new Set(baseOptionalColumns.map(c => c.key))); setVisibleLanguages([]); }}
                    >
                      清空
                    </button>
                  </div>
                </div>

                {/* Base optional columns */}
                {baseOptionalColumns.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>基础字段</span>
                    {baseOptionalColumns.map(col => (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}>
                        <input
                          type="checkbox"
                          checked={!hiddenBaseColumns.has(col.key)}
                          onChange={(e) => {
                            const next = new Set(hiddenBaseColumns);
                            if (e.target.checked) {
                              next.delete(col.key);
                            } else {
                              next.add(col.key);
                            }
                            setHiddenBaseColumns(next);
                          }}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Language columns */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>语种列</span>
                  {targetLanguages.map(lang => (
                    <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}>
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
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span>{lang}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 0.15rem' }} />

          <button className="heroui-btn" onClick={onExportXLS} title="导出当前表数据为 Excel (.xlsx)">
            <FileOutput size={14} />
            <span>导出 XLS</span>
          </button>

          <button className="heroui-btn" onClick={onExportCSV} title="导出当前表数据为 CSV 文件（不含所在页面与字号类别）">
            <FileOutput size={14} />
            <span>导出 CSV</span>
          </button>

          {projectRole !== 'viewer' && csvImportNode}
        </div>

        {/* Right: Selected Row Actions OR Management Tools + Primary CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {selectedCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'var(--bg-primary)', padding: '3px 6px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 0.35rem' }}>
                已选 <strong style={{ color: 'var(--accent)' }}>{selectedCount}</strong> 项
              </span>
              
              <button type="button" className="btn-text" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0 4px' }} onClick={onClearSelection}>
                取消
              </button>

              <div style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 0.1rem' }} />

              {/* 复制表格内容 */}
              <button
                className="heroui-btn heroui-btn-accent"
                style={{ height: '30px', fontSize: '0.78rem' }}
                onClick={onCopyContent}
                title="自定义复制选中行到剪贴板，支持选择复制列、反选，方便直接粘贴至 CSV / XLS / 表格中"
              >
                <ClipboardCopy size={13} />
                <span>复制内容</span>
              </button>

              {projectRole !== 'viewer' && (
                <>
                  <button className="heroui-btn" style={{ height: '30px', fontSize: '0.78rem' }} onClick={onBatchApprove}>
                    <CheckCircle size={13} style={{ color: 'var(--green)' }} />
                    <span>批量审核</span>
                  </button>

                  <button className="heroui-btn" style={{ height: '30px', fontSize: '0.78rem' }} onClick={onBatchCategory}>
                    <Layers size={13} />
                    <span>分类</span>
                  </button>

                  <button className="heroui-btn" style={{ height: '30px', fontSize: '0.78rem' }} onClick={onBatchCopy}>
                    <Copy size={13} />
                    <span>复制到表</span>
                  </button>

                  <button className="heroui-btn" style={{ height: '30px', fontSize: '0.78rem' }} onClick={onBatchLock} title="锁定选中的词条只读">
                    <Lock size={13} style={{ color: 'var(--red)' }} />
                    <span>锁定</span>
                  </button>

                  <button className="heroui-btn" style={{ height: '30px', fontSize: '0.78rem' }} onClick={onBatchUnlock} title="解锁选中的词条">
                    <Unlock size={13} />
                    <span>解锁</span>
                  </button>

                  <button
                    className="heroui-btn heroui-btn-danger"
                    style={{ height: '30px', fontSize: '0.78rem' }}
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
                  className="heroui-btn"
                  style={{ color: 'var(--yellow)' }}
                  onClick={onClearHighlights}
                  title="清除页面改动标记高亮"
                >
                  <Eraser size={14} />
                  <span>清除标记 ({modifiedCount})</span>
                </button>
              )}

              {projectRole !== 'viewer' && (
                <>
                  <button className="heroui-btn" onClick={onDataClean} title="清除无 KW 或无中文的空记录">
                    <Trash2 size={14} />
                    <span>数据清理</span>
                  </button>

                  <button className="heroui-btn" onClick={onBatchAdd} title="手动批量新增词条">
                    <Layers size={14} />
                    <span>批量新增</span>
                  </button>

                  {onInherit && tables.length > 1 && (
                    <button
                      className="heroui-btn heroui-btn-accent"
                      onClick={onInherit}
                      title="从其他大表继承补全未翻译的 cell (跳过已锁定词条)"
                    >
                      <Sparkles size={14} />
                      <span>继承翻译</span>
                    </button>
                  )}

                  {difyConfigured && (
                    <button className="heroui-btn heroui-btn-ai" onClick={onBatchTranslate} title="调用 Dify 批量翻译 (无选中时扫描全部)">
                      <Bot size={14} />
                      <span>批量 AI 翻译</span>
                    </button>
                  )}

                  <button className="heroui-btn heroui-btn-primary" onClick={onAddTerm}>
                    <Plus size={15} />
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
