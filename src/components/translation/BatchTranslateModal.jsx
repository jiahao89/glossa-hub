import React from 'react';
import GlossaModal from '../GlossaModal';
import { Loader2, Check } from 'lucide-react';

export default function BatchTranslateModal({
  open,
  onClose,
  tables = [],
  batchTargetTableId,
  onBatchTargetTableChange,
  batchPreviewList = [],
  selectedBatchItemIds,
  setSelectedBatchItemIds,
  batchProgress,
  isTranslatingBatch,
  isSavingBatch,
  onStartBatchTranslate,
  onConfirmBatchWrite,
  targetLanguages = [],
  excludedTranslateLangs = new Set(),
  excludedOnlyCount = 0,
  onToggleExcludeLang = () => {},
  onSetExcludedLangs = () => {}
}) {
  if (!open) return null;

  const excludedList = targetLanguages.filter(l => excludedTranslateLangs.has(l));
  const translatableSelectedCount = batchPreviewList.filter(
    i => selectedBatchItemIds.has(i.recordId) && Array.isArray(i.missingLangs) && i.missingLangs.length > 0
  ).length;
  const isScopeBlockingTranslation = translatableSelectedCount === 0 && excludedList.length > 0;

  const hasThai = targetLanguages.some(l => l.includes('泰') || l.toUpperCase().includes('TH'));
  const isThaiExcluded = Array.from(excludedTranslateLangs).some(l => l.includes('泰') || l.toUpperCase().includes('TH'));

  const handleToggleThai = () => {
    const thaiLang = targetLanguages.find(l => l.includes('泰') || l.toUpperCase().includes('TH'));
    if (!thaiLang) return;
    const next = new Set(excludedTranslateLangs);
    if (next.has(thaiLang)) {
      next.delete(thaiLang);
    } else {
      next.add(thaiLang);
    }
    onSetExcludedLangs(next);
  };

  const handleIncludeAll = () => {
    onSetExcludedLangs(new Set());
  };

  const modalTitle = translatableSelectedCount !== selectedBatchItemIds.size
    ? `Dify 批量智能翻译工作流 (已选 ${selectedBatchItemIds.size} / 共 ${batchPreviewList.length} 条 · 可译 ${translatableSelectedCount} 条)`
    : `Dify 批量智能翻译工作流 (已选 ${selectedBatchItemIds.size} / 共 ${batchPreviewList.length} 条待翻译)`;

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      title={modalTitle}
      maxWidth="920px"
      closeDisabled={isTranslatingBatch}
      footer={
        <>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            disabled={isTranslatingBatch}
          >
            取消
          </button>
          <button
            onClick={onStartBatchTranslate}
            className="btn btn-secondary"
            disabled={isTranslatingBatch || isSavingBatch || translatableSelectedCount === 0}
            title={isScopeBlockingTranslation ? `当前已排除 ${excludedList.join('、')}，请先在上方恢复包含后再翻译` : undefined}
          >
            {isTranslatingBatch ? (
              <><Loader2 size={14} className="animate-spin" /> 正在调用 Dify 翻译...</>
            ) : (
              `开始 Dify 翻译 (${translatableSelectedCount})`
            )}
          </button>
          <button
            onClick={onConfirmBatchWrite}
            className="btn btn-primary"
            disabled={
              isTranslatingBatch ||
              isSavingBatch ||
              batchPreviewList.every(i => !selectedBatchItemIds.has(i.recordId) || Object.keys(i.translations || {}).length === 0)
            }
          >
            {isSavingBatch ? (
              <><Loader2 size={14} className="animate-spin" /> 正在保存更新...</>
            ) : (
              <><Check size={14} /> 确认并保存更新</>
            )}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {/* Target Table Selector & Selection Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>目标版本 (数据表):</span>
            <select
              value={batchTargetTableId}
              onChange={(e) => onBatchTargetTableChange(e.target.value)}
              className="select-input"
              style={{ width: '200px' }}
              disabled={isTranslatingBatch}
            >
              {tables.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            已勾选 <strong style={{ color: 'var(--accent)' }}>{selectedBatchItemIds.size}</strong> / {batchPreviewList.length} 项
          </div>
        </div>

        {/* Excluded Languages Filter Panel */}
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: isScopeBlockingTranslation ? '1px solid var(--amber, #f59e0b)' : '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '0.65rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', flexWrap: 'wrap' }}>
              <span>🌐 翻译语种范围</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                (默认保留已有翻译，仅对缺失语种进行智能补全；点击标签可额外排除语种{excludedOnlyCount > 0 ? `；另有 ${excludedOnlyCount} 条仅缺已排除语种` : ''})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {hasThai && (
                <button
                  type="button"
                  onClick={handleToggleThai}
                  disabled={isTranslatingBatch}
                  className="btn btn-xs"
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    border: isThaiExcluded ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                    backgroundColor: isThaiExcluded ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    color: isThaiExcluded ? 'var(--accent)' : 'var(--text-secondary)'
                  }}
                >
                  {isThaiExcluded ? '✓ 恢复包含泰语' : '✕ 排除泰语'}
                </button>
              )}
              {excludedList.length > 0 && (
                <button
                  type="button"
                  onClick={handleIncludeAll}
                  disabled={isTranslatingBatch}
                  className="btn btn-xs btn-text"
                  style={{ fontSize: '0.72rem', color: 'var(--accent)', padding: '2px 6px' }}
                >
                  全部包含 ({targetLanguages.length})
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {targetLanguages.map(lang => {
              const isExcluded = excludedTranslateLangs.has(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  disabled={isTranslatingBatch}
                  onClick={() => onToggleExcludeLang(lang)}
                  title={isExcluded ? `已排除 ${lang}，点击恢复` : `正在翻译 ${lang}，点击排除`}
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: isExcluded ? '1px dashed var(--border-color)' : '1px solid var(--accent)',
                    backgroundColor: isExcluded ? 'var(--bg-tertiary)' : 'rgba(59, 130, 246, 0.12)',
                    color: isExcluded ? 'var(--text-muted)' : 'var(--accent)',
                    cursor: isTranslatingBatch ? 'not-allowed' : 'pointer',
                    textDecoration: isExcluded ? 'line-through' : 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{lang}</span>
                  {isExcluded ? (
                    <span style={{ fontSize: '0.65rem', textDecoration: 'none', color: 'var(--text-muted)', opacity: 0.8 }}>[排除]</span>
                  ) : (
                    <span style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress and status alert */}
        <div
          className={`alert-box ${isScopeBlockingTranslation ? 'alert-box-warning' : 'alert-box-info'}`}
          style={{
            flexDirection: 'column',
            gap: '0.5rem',
            ...(isScopeBlockingTranslation ? {
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderColor: 'rgba(245, 158, 11, 0.45)',
              color: 'var(--amber, #d97706)'
            } : {})
          }}
        >
          <div style={{ fontWeight: '600' }}>{batchProgress.status}</div>
          {batchProgress.total > 0 && (
            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.25rem' }}>
              <div
                style={{
                  height: '100%',
                  backgroundColor: 'var(--accent)',
                  width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                  transition: 'width 0.2s'
                }}
              ></div>
            </div>
          )}
        </div>

        {/* Data Preview Table */}
        <div style={{ flex: 1, overflow: 'auto', maxHeight: '45vh', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table" style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ width: '38px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedBatchItemIds.size === batchPreviewList.length && batchPreviewList.length > 0}
                    onChange={() => {
                      if (selectedBatchItemIds.size === batchPreviewList.length) {
                        setSelectedBatchItemIds(new Set());
                      } else {
                        setSelectedBatchItemIds(new Set(batchPreviewList.map(i => i.recordId)));
                      }
                    }}
                    disabled={isTranslatingBatch}
                  />
                </th>
                <th>KW</th>
                <th>中文</th>
                <th>待翻译语种</th>
                <th>AI 翻译预览</th>
              </tr>
            </thead>
            <tbody>
              {batchPreviewList.map((item, idx) => {
                const isChecked = selectedBatchItemIds.has(item.recordId);
                return (
                  <tr key={item.recordId || idx} style={{ opacity: isChecked ? 1 : 0.45, transition: 'opacity 0.15s' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const nextSet = new Set(selectedBatchItemIds);
                          if (nextSet.has(item.recordId)) {
                            nextSet.delete(item.recordId);
                          } else {
                            nextSet.add(item.recordId);
                          }
                          setSelectedBatchItemIds(nextSet);
                        }}
                        disabled={isTranslatingBatch}
                      />
                    </td>
                    <td className="mono">{item.KW}</td>
                    <td>{item.中文}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {Array.isArray(item.missingLangs) && item.missingLangs.length > 0 ? (
                        item.missingLangs.join(', ')
                      ) : Array.isArray(item.excludedMissingLangs) && item.excludedMissingLangs.length > 0 ? (
                        <span style={{ color: 'var(--amber, #d97706)' }}>
                          当前范围无待译（已排除：{item.excludedMissingLangs.join(', ')}）
                        </span>
                      ) : (
                        '无'
                      )}
                    </td>
                    <td>
                      {(!item.translations || Object.keys(item.translations).length === 0) ? (
                        <span className="cell-empty">等待运行...</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {Object.entries(item.translations).map(([lang, val]) => (
                            <div key={lang} style={{ fontSize: '0.75rem' }}>
                              <span style={{ color: 'var(--accent)' }}>{lang}:</span> {val}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </GlossaModal>
  );
}
