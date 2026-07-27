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
  onConfirmBatchWrite
}) {
  if (!open) return null;

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      title={`Dify 批量智能翻译工作流 (已选 ${selectedBatchItemIds.size} / 共 ${batchPreviewList.length} 条待翻译)`}
      maxWidth="900px"
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
            disabled={isTranslatingBatch || isSavingBatch || selectedBatchItemIds.size === 0}
          >
            {isTranslatingBatch ? (
              <><Loader2 size={14} className="animate-spin" /> 正在调用 Dify 翻译...</>
            ) : (
              `开始 Dify 翻译 (${selectedBatchItemIds.size})`
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

        {/* Progress and status alert */}
        <div className="alert-box alert-box-info" style={{ flexDirection: 'column', gap: '0.5rem' }}>
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
                  <tr key={idx} style={{ opacity: isChecked ? 1 : 0.45, transition: 'opacity 0.15s' }}>
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
                      {(Array.isArray(item.missingLangs) ? item.missingLangs : []).join(', ')}
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
