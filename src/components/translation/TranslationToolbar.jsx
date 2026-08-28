import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  FileOutput,
  Layers,
  Lock,
  Unlock,
  CheckCircle,
  Bot,
  Eraser,
  Settings,
  Copy,
  Trash2,
  ClipboardCopy,
  Filter,
  Sparkles,
  ChevronDown,
  Wrench,
  Zap
} from 'lucide-react';

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
  onBatchGenerateKw,
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
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);

  const colDropdownRef = useRef(null);
  const exportDropdownRef = useRef(null);
  const toolsDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (colDropdownRef.current && !colDropdownRef.current.contains(e.target)) {
        setColDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setExportDropdownOpen(false);
      }
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target)) {
        setToolsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      {selectedCount > 0 ? (
        <div className="heroui-selection-row" style={{ marginTop: '0.2rem' }}>
          {/* Left: Count Badge & Cancel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
            <span className="heroui-badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent)', borderColor: 'rgba(59, 130, 246, 0.3)', fontWeight: 600, padding: '3px 10px' }}>
              已选择 {selectedCount} 项
            </span>
            <button
              type="button"
              className="btn-text"
              style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '2px 6px', whiteSpace: 'nowrap' }}
              onClick={onClearSelection}
            >
              取消
            </button>
            <div style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 0.15rem' }} />
          </div>

          {/* Center Actions: Core Workflow Operations */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', flex: 1 }}>
            {/* ⭐ 1. 批量 AI 翻译所选 (N) */}
            {difyConfigured && projectRole !== 'viewer' && (
              <button
                className="heroui-btn heroui-btn-sm heroui-btn-ai"
                onClick={onBatchTranslate}
                title={`调用 Dify 翻译选中的 ${selectedCount} 个词条`}
              >
                <Sparkles size={13} />
                <span>AI 翻译所选 ({selectedCount})</span>
              </button>
            )}

            {/* ⭐ 2. 复制表格内容 */}
            <button
              className="heroui-btn heroui-btn-sm heroui-btn-accent"
              onClick={onCopyContent}
              title="自定义复制选中行到剪贴板，支持选择复制列、反选，方便直接粘贴至 CSV / XLS / 表格中"
            >
              <ClipboardCopy size={13} />
              <span>复制内容</span>
            </button>

            {/* ⭐ 3. 批量生成 KW */}
            {projectRole !== 'viewer' && onBatchGenerateKw && (
              <button
                className="heroui-btn heroui-btn-sm"
                onClick={onBatchGenerateKw}
                title="智能生成选中词条的 KW 键名标识"
              >
                <Zap size={13} style={{ color: 'var(--yellow)' }} />
                <span>生成 KW</span>
              </button>
            )}

            {projectRole !== 'viewer' && (
              <>
                <button className="heroui-btn heroui-btn-sm" onClick={onBatchApprove}>
                  <CheckCircle size={13} style={{ color: 'var(--green)' }} />
                  <span>批量审核</span>
                </button>

                <button className="heroui-btn heroui-btn-sm" onClick={onBatchCategory}>
                  <Layers size={13} />
                  <span>分类</span>
                </button>

                <button className="heroui-btn heroui-btn-sm" onClick={onBatchCopy}>
                  <Copy size={13} />
                  <span>复制到表</span>
                </button>

                <button className="heroui-btn heroui-btn-sm" onClick={onBatchLock} title="锁定选中的词条只读">
                  <Lock size={13} style={{ color: 'var(--red)' }} />
                  <span>锁定</span>
                </button>

                <button className="heroui-btn heroui-btn-sm" onClick={onBatchUnlock} title="解锁选中的词条">
                  <Unlock size={13} />
                  <span>解锁</span>
                </button>
              </>
            )}
          </div>

          {/* Right Actions: Delete */}
          {projectRole !== 'viewer' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
              <button
                className="heroui-btn heroui-btn-sm heroui-btn-danger"
                onClick={onBatchDelete}
                title="将选中的词条送入回收站 (30 天内可恢复)"
              >
                <Trash2 size={13} />
                <span>删除 ({selectedCount})</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="heroui-row" style={{ paddingTop: '0.45rem', borderTop: '1px solid var(--border-color)', gap: '0.6rem' }}>
          {/* Left Functional Group: Columns Selector & Export/Import Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'nowrap' }}>
            {/* Columns Selector Dropdown */}
            <div style={{ position: 'relative' }} ref={colDropdownRef}>
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

            <div style={{ width: '1px', height: '18px', background: 'var(--border-color)', margin: '0 0.1rem' }} />

            {/* Consolidated Export Dropdown */}
            <div style={{ position: 'relative' }} ref={exportDropdownRef}>
              <button
                className="heroui-btn"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                title="导出数据为 Excel 或 CSV"
              >
                <FileOutput size={14} />
                <span>导出数据</span>
                <ChevronDown size={12} style={{ opacity: 0.7 }} />
              </button>

              {exportDropdownOpen && (
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
                    padding: '0.4rem',
                    minWidth: '170px'
                  }}
                >
                  <button
                    className="dropdown-item"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                    onClick={() => { setExportDropdownOpen(false); onExportXLS(); }}
                  >
                    <span>📊</span>
                    <span>导出 Excel (.xlsx)</span>
                  </button>
                  <button
                    className="dropdown-item"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                    onClick={() => { setExportDropdownOpen(false); onExportCSV(); }}
                  >
                    <span>📄</span>
                    <span>导出 CSV (.csv)</span>
                  </button>
                </div>
              )}
            </div>

            {projectRole !== 'viewer' && csvImportNode}
          </div>

          {/* Right Functional Group: Primary Actions + Tools Dropdown at the far right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'nowrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            {difyConfigured && (
              <button className="heroui-btn heroui-btn-ai" onClick={onBatchTranslate} title="调用 Dify 批量翻译 (扫描未翻译词条)">
                <Bot size={14} />
                <span>批量 AI 翻译</span>
              </button>
            )}

            {projectRole !== 'viewer' && (
              <button className="heroui-btn heroui-btn-primary" onClick={onAddTerm}>
                <Plus size={15} />
                <span>新增词条</span>
              </button>
            )}

            {projectRole !== 'viewer' && (
              <div style={{ position: 'relative' }} ref={toolsDropdownRef}>
                <button
                  className="heroui-btn"
                  onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                  title="更多数据维护与快捷工具"
                >
                  <Wrench size={14} />
                  <span>更多工具</span>
                  {modifiedCount > 0 && (
                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--yellow)', marginLeft: '-2px' }} />
                  )}
                  <ChevronDown size={12} style={{ opacity: 0.7 }} />
                </button>

                {toolsDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '40px',
                      zIndex: 100,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-lg)',
                      padding: '0.4rem',
                      minWidth: '180px'
                    }}
                  >
                    {onInherit && tables.length > 1 && (
                      <button
                        className="dropdown-item"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}
                        onClick={() => { setToolsDropdownOpen(false); onInherit(); }}
                      >
                        <Sparkles size={14} />
                        <span>继承翻译 (补全未译)</span>
                      </button>
                    )}

                    <button
                      className="dropdown-item"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                      onClick={() => { setToolsDropdownOpen(false); onBatchAdd(); }}
                    >
                      <Layers size={14} />
                      <span>批量新增词条</span>
                    </button>

                    {onBatchGenerateKw && (
                      <button
                        className="dropdown-item"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                        onClick={() => { setToolsDropdownOpen(false); onBatchGenerateKw(); }}
                      >
                        <Zap size={14} style={{ color: 'var(--yellow)' }} />
                        <span>批量生成 KW (补全空缺)</span>
                      </button>
                    )}

                    <button
                      className="dropdown-item"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                      onClick={() => { setToolsDropdownOpen(false); onDataClean(); }}
                    >
                      <Trash2 size={14} />
                      <span>数据清理 (空行扫描)</span>
                    </button>

                    {modifiedCount > 0 && (
                      <button
                        className="dropdown-item"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem', textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--yellow)', cursor: 'pointer', borderTop: '1px solid var(--border-color)', marginTop: '4px', paddingTop: '6px' }}
                        onClick={() => { setToolsDropdownOpen(false); onClearHighlights(); }}
                      >
                        <Eraser size={14} />
                        <span>清除页面标记 ({modifiedCount})</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
