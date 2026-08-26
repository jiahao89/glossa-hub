import React, { useState, useMemo, useEffect, useCallback } from 'react';
import GlossaModal from '../GlossaModal';
import { ClipboardCopy, Check, FileSpreadsheet, RotateCcw, CheckSquare, Square } from 'lucide-react';
import { useToast } from '../Toast';

export default function CopyContentModal({
  open,
  onClose,
  selectedRecords = [],
  targetLanguages = [],
  getRecordValueByName
}) {
  const toast = useToast();
  const [format, setFormat] = useState('tsv'); // 'tsv' (Excel/XLS) or 'csv'
  const [includeHeader, setIncludeHeader] = useState(true);
  const [copied, setCopied] = useState(false);

  // Define all available columns
  const allColumns = useMemo(() => {
    const baseCols = [
      { key: 'KW', label: 'KW (键名)', group: 'base' },
      { key: 'CN（中文）', label: 'CN (中文)', group: 'base' },
      { key: '所在页面', label: '所在页面', group: 'base' },
      { key: '字号类别', label: '字号/负责人', group: 'base' },
      { key: 'status', label: '审核状态', group: 'base' },
    ];

    const langCols = targetLanguages.map(lang => ({
      key: lang,
      label: lang,
      group: 'lang'
    }));

    return [...baseCols, ...langCols];
  }, [targetLanguages]);

  // Default: all columns selected
  const [selectedColumns, setSelectedColumns] = useState(() => new Set(allColumns.map(c => c.key)));

  // Reset selected columns when allColumns change
  useEffect(() => {
    setSelectedColumns(new Set(allColumns.map(c => c.key)));
  }, [allColumns]);

  // Reset copied state on open
  useEffect(() => {
    if (open) {
      setCopied(false);
    }
  }, [open]);

  // Extract cell value helper
  const getColValue = useCallback((rec, colKey) => {
    if (!rec) return '';
    if (colKey === 'status') {
      return rec.status || 'DRAFT';
    }
    if (colKey === 'KW') {
      return (getRecordValueByName && getRecordValueByName(rec, 'KW')) || rec.KW || rec.fields?.KW || '';
    }
    if (colKey === 'CN（中文）') {
      return (getRecordValueByName && (getRecordValueByName(rec, 'CN（中文）') || getRecordValueByName(rec, '中文'))) || rec.fields?.['CN（中文）'] || rec.fields?.['中文'] || '';
    }
    if (colKey === '所在页面') {
      return (getRecordValueByName && getRecordValueByName(rec, '所在页面')) || rec.fields?.['所在页面'] || '';
    }
    if (colKey === '字号类别') {
      return (getRecordValueByName && (getRecordValueByName(rec, '字号类别') || getRecordValueByName(rec, '负责人'))) || rec.fields?.['字号类别'] || rec.fields?.['负责人'] || '';
    }
    return (getRecordValueByName && getRecordValueByName(rec, colKey)) || rec.fields?.[colKey] || '';
  }, [getRecordValueByName]);

  // Escape formatting
  const escapeCell = useCallback((val, fmt) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (fmt === 'tsv') {
      // For TSV, quotes are required if cell contains tab, newline, or double quote
      if (str.includes('\t') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    } else {
      // For CSV, quotes are required if cell contains comma, newline, or double quote
      if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }
  }, []);

  // Generate output text
  const activeCols = useMemo(() => {
    return allColumns.filter(col => selectedColumns.has(col.key));
  }, [allColumns, selectedColumns]);

  const generatedContent = useMemo(() => {
    if (activeCols.length === 0 || selectedRecords.length === 0) return '';
    const delimiter = format === 'tsv' ? '\t' : ',';
    const lines = [];

    // Header row
    if (includeHeader) {
      const headerLine = activeCols
        .map(col => escapeCell(col.label, format))
        .join(delimiter);
      lines.push(headerLine);
    }

    // Data rows
    selectedRecords.forEach(rec => {
      const row = activeCols
        .map(col => escapeCell(getColValue(rec, col.key), format))
        .join(delimiter);
      lines.push(row);
    });

    return lines.join('\n');
  }, [activeCols, selectedRecords, format, includeHeader, getColValue, escapeCell]);

  // Actions
  const handleSelectAll = () => {
    setSelectedColumns(new Set(allColumns.map(c => c.key)));
  };

  const handleInvertSelection = () => {
    setSelectedColumns(prev => {
      const next = new Set();
      allColumns.forEach(col => {
        if (!prev.has(col.key)) {
          next.add(col.key);
        }
      });
      return next;
    });
  };

  const handleClearAll = () => {
    setSelectedColumns(new Set());
  };

  const toggleColumn = (key) => {
    setSelectedColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCopy = async () => {
    if (!generatedContent) {
      toast.error('请至少选择一个列进行复制');
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(generatedContent);
      } else {
        // Fallback for older browsers / non-HTTPS
        const textarea = document.createElement('textarea');
        textarea.value = generatedContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopied(true);
      toast.success(`已成功复制 ${selectedRecords.length} 条记录（共 ${activeCols.length} 列）到剪贴板！可以直接粘贴到 Excel/CSV`);
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    } catch (err) {
      console.error('复制失败:', err);
      toast.error('复制到剪贴板失败，请手动全选预览内容复制');
    }
  };

  if (!open) return null;

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      maxWidth="720px"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardCopy size={18} style={{ color: 'var(--accent)' }} />
          <span>复制表格内容</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: '6px' }}>
            (已选 <strong style={{ color: 'var(--accent)' }}>{selectedRecords.length}</strong> 条记录)
          </span>
        </div>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            已选 <strong style={{ color: 'var(--accent)' }}>{activeCols.length}</strong> / {allColumns.length} 列 · {selectedRecords.length} 行数据
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              关闭
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCopy}
              disabled={activeCols.length === 0 || selectedRecords.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {copied ? <Check size={16} style={{ color: 'var(--green)' }} /> : <ClipboardCopy size={16} />}
              <span>{copied ? '已复制到剪贴板！' : '复制到剪贴板'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Column Selection Toolbar */}
        <div style={{ background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileSpreadsheet size={16} style={{ color: 'var(--accent)' }} />
              <span>选择要复制的 Column（列）</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.78rem', height: '26px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={handleSelectAll}
              >
                <CheckSquare size={12} />
                <span>全选</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.78rem', height: '26px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={handleInvertSelection}
              >
                <RotateCcw size={12} />
                <span>反选</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.78rem', height: '26px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={handleClearAll}
              >
                <Square size={12} />
                <span>清空</span>
              </button>
            </div>
          </div>

          {/* Base fields */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
              基础属性
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
              {allColumns.filter(c => c.group === 'base').map(col => {
                const checked = selectedColumns.has(col.key);
                return (
                  <label
                    key={col.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: checked ? 'rgba(var(--accent-rgb, 59, 130, 246), 0.1)' : 'var(--bg-primary)',
                      border: checked ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(col.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: checked ? 500 : 400 }}>
                      {col.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Language fields */}
          {targetLanguages.length > 0 && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                目标语种译文列 ({targetLanguages.length})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
                {allColumns.filter(c => c.group === 'lang').map(col => {
                  const checked = selectedColumns.has(col.key);
                  return (
                    <label
                      key={col.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: checked ? 'rgba(var(--accent-rgb, 59, 130, 246), 0.1)' : 'var(--bg-primary)',
                        border: checked ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleColumn(col.key)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: checked ? 500 : 400 }}>
                        {col.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Copy Format & Options */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
          {/* Format Radio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>复制格式:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="copyFormat"
                value="tsv"
                checked={format === 'tsv'}
                onChange={() => setFormat('tsv')}
              />
              <span>制表符 TSV <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(推荐，可直接粘贴进 Excel/表格各单元格)</span></span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="copyFormat"
                value="csv"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
              />
              <span>逗号分隔 CSV <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(纯文本 CSV 格式)</span></span>
            </label>
          </div>

          {/* Include Header Checkbox */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeHeader}
              onChange={(e) => setIncludeHeader(e.target.checked)}
            />
            <span style={{ color: 'var(--text-primary)' }}>包含表头（第一行输出列名）</span>
          </label>
        </div>

        {/* Live Preview snippet */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              内容预览（前 3 行）:
            </span>
          </div>
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              fontFamily: 'monospace',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              maxHeight: '110px',
              overflowY: 'auto',
              whiteSpace: 'pre',
              lineHeight: 1.5
            }}
          >
            {activeCols.length === 0 ? (
              <span style={{ color: 'var(--text-muted)' }}>未勾选任何列</span>
            ) : selectedRecords.length === 0 ? (
              <span style={{ color: 'var(--text-muted)' }}>未选择任何记录</span>
            ) : (
              generatedContent.split('\n').slice(0, 4).join('\n') + (generatedContent.split('\n').length > 4 ? `\n... (共 ${generatedContent.split('\n').length} 行数据)` : '')
            )}
          </div>
        </div>
      </div>
    </GlossaModal>
  );
}
