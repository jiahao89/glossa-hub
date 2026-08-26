import React, { useState, useRef } from 'react';
import { useToast } from '../Toast';
import GlossaModal from '../GlossaModal';
import { parseCSV, fuzzyFindIndex } from '../../utils/csvHelper';
import { apiFetch } from '../../utils/api';
import { Upload } from 'lucide-react';

const fuzzyKeywords = ['中文', 'CN', '汉语', 'Chinese'];

export default function CSVImportHandler({ selectedTableId, currentRecords, targetLanguages = [], onImportComplete, disabled }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [importDiff, setImportDiff] = useState(null); // { added: [], modified: [], unchanged: [], removed: [], csvRecords: [] }
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTriggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleCsvImportSelected = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const parsedRows = parseCSV(text);
        if (parsedRows.length === 0) {
          toast.error('CSV 文件中没有有效数据！');
          return;
        }

        const headers = parsedRows[0];
        const rows = parsedRows.slice(1);

        if (rows.length === 0) {
          toast.error('CSV 文件中没有有效数据！');
          return;
        }

        // --- Column Mapping ---
        const colMap = [];

        const kwIdx = fuzzyFindIndex(headers, ['KW', 'KeyWord', '键名', '标识'], ['kw', 'key']);
        const zhIdx = fuzzyFindIndex(headers, ['CN（中文）', '中文', 'CN', 'Chinese', '源文本'], fuzzyKeywords);
        const pageIdx = fuzzyFindIndex(headers, ['所在页面', '页面', '所属界面', '界面'], ['页面', '界面', 'page']);
        const typeIdx = fuzzyFindIndex(headers, ['字号类别', '类别', '字号'], ['字号', '类别', 'type']);

        if (kwIdx === -1 && zhIdx === -1) {
          toast.error('CSV 结构非法：必须包含 "KW" 或 "CN（中文）" 列！');
          return;
        }

        if (kwIdx !== -1) colMap.push({ idx: kwIdx, fieldName: 'KW' });
        if (zhIdx !== -1) colMap.push({ idx: zhIdx, fieldName: 'CN（中文）' });
        if (pageIdx !== -1) colMap.push({ idx: pageIdx, fieldName: '所在页面' });
        if (typeIdx !== -1) colMap.push({ idx: typeIdx, fieldName: '字号类别' });

        targetLanguages.forEach(lang => {
          let fuzzyKeys = [lang.toLowerCase()];
          const match = lang.match(/([a-zA-Z]+)[（(](.+)[)）]/);
          if (match) {
            fuzzyKeys = [match[1].toLowerCase(), match[2].toLowerCase()];
          }
          const csvLangIdx = fuzzyFindIndex(headers, [lang], fuzzyKeys);
          if (csvLangIdx !== -1) {
            colMap.push({ idx: csvLangIdx, fieldName: lang });
          }
        });

        // --- Build CSV Objects ---
        const csvRecords = rows.map((row, ridx) => {
          const fields = {};
          colMap.forEach(({ idx, fieldName }) => {
            if (row[idx] !== undefined) fields[fieldName] = row[idx];
          });
          return {
            recordId: `csv-import-${ridx}`,
            fields,
            kw: (fields['KW'] || '').trim(),
          };
        }).filter(r => r.kw || (r.fields['CN（中文）'] && r.fields['CN（中文）'].trim() !== ''));

        if (csvRecords.length === 0) {
          toast.error('CSV 文件中没有有效的数据！');
          return;
        }

        // --- Diffing against Current Records ---
        const currentByKw = {};
        currentRecords.forEach(rec => {
          const kw = (rec.fields['KW'] || '').trim();
          if (kw) currentByKw[kw.toLowerCase()] = rec;
        });

        const added = [];
        const modified = [];
        const unchanged = [];
        const usedKws = new Set();

        csvRecords.forEach(csvRec => {
          const csvKw = csvRec.kw.toLowerCase();
          const existing = currentByKw[csvKw];
          if (!existing) {
            added.push(csvRec);
            usedKws.add(csvKw);
          } else {
            usedKws.add(csvKw);
            const changes = {};
            const allFields = ['所在页面', '字号类别', 'KW', 'CN（中文）', ...targetLanguages];
            allFields.forEach(field => {
              const csvVal = (csvRec.fields[field] || '').trim();
              const curVal = (existing.fields[field] || '').trim();
              if (csvVal !== curVal) {
                changes[field] = { old: curVal, new: csvVal };
              }
            });
            if (Object.keys(changes).length > 0) {
              modified.push({ ...csvRec, existingRecord: existing, changes });
            } else {
              unchanged.push({ ...csvRec, existingRecord: existing });
            }
          }
        });

        const removed = currentRecords.filter(rec => {
          const kw = (rec.fields['KW'] || '').trim().toLowerCase();
          return kw && !usedKws.has(kw);
        });

        if (added.length === 0 && modified.length === 0) {
          toast.info(`没有检测到变化（${unchanged.length} 条一致，${removed.length} 条不在CSV中）`);
          return;
        }

        setImportDiff({ added, modified, unchanged, removed, csvRecords });
        setImportPreviewOpen(true);
      } catch (err) {
        toast.error(`解析 CSV 失败: ${err.message}`);
      } finally {
        setLoading(false);
        event.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmImport = async () => {
    if (!importDiff || !selectedTableId) return;

    try {
      setLoading(true);

      // Build sort order map from original CSV row order
      const csvSortMap = {};
      importDiff.csvRecords.forEach((rec, idx) => {
        csvSortMap[rec.kw.toLowerCase()] = idx;
      });
      // Records not in CSV (removed) get placed after all CSV records
      const csvMaxSort = importDiff.csvRecords.length;

      const addedForSync = importDiff.added.map(rec => {
        const newRecordId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return {
          recordId: newRecordId,
          fields: rec.fields,
          sortOrder: csvSortMap[rec.kw.toLowerCase()] ?? csvMaxSort
        };
      });

      const updatedForSync = importDiff.modified.map(rec => {
        const existingRecordId = rec.existingRecord.id || rec.existingRecord.recordId;
        const newFields = { ...rec.existingRecord.fields };
        Object.entries(rec.changes).forEach(([field, { new: newVal }]) => {
          newFields[field] = newVal;
        });
        return {
          recordId: existingRecordId,
          fields: newFields,
          sortOrder: csvSortMap[rec.kw.toLowerCase()] ?? csvMaxSort
        };
      });

      // Reorder unchanged records to match CSV positions
      const reorderForSync = importDiff.unchanged.map(rec => {
        const existingRecordId = rec.existingRecord?.id || rec.existingRecord?.recordId || rec.recordId;
        return {
          recordId: existingRecordId,
          sortOrder: csvSortMap[rec.kw.toLowerCase()] ?? csvMaxSort
        };
      }).filter(r => r.recordId && r.sortOrder !== undefined);

      const res = await apiFetch(`/api/tables/${selectedTableId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          added: addedForSync,
          updated: updatedForSync,
          reorder: reorderForSync
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '批量同步失败');
      }

      toast.success(`导入成功！新增 ${addedForSync.length} 条，更新 ${updatedForSync.length} 条。`);
      setImportPreviewOpen(false);
      setImportDiff(null);
      
      if (onImportComplete) {
        onImportComplete({ added: addedForSync, updated: updatedForSync });
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={handleTriggerImport} 
        className="heroui-btn" 
        title="导入 CSV"
        disabled={disabled || loading}
      >
        <Upload size={14} />
        <span>导入 CSV</span>
      </button>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleCsvImportSelected}
        accept=".csv"
      />

      {importPreviewOpen && importDiff && (
        <GlossaModal
          isOpen={true}
          onClose={() => setImportPreviewOpen(false)}
          title="CSV 导入预览"
          maxWidth="900px"
          closeDisabled={loading}
          footer={
            <>
              <button onClick={() => setImportPreviewOpen(false)} className="btn btn-secondary" disabled={loading}>取消</button>
              <button onClick={handleConfirmImport} className="btn btn-primary" disabled={loading}>
                {loading ? '正在导入...' : `确认导入 (新增 ${importDiff.added.length}, 修改 ${importDiff.modified.length})`}
              </button>
            </>
          }
        >
          <div style={{ marginBottom: '1rem', padding: '0.8rem', background: 'var(--bg-panel)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
              <div><strong>新增词条：</strong> <span style={{ color: 'var(--green)' }}>{importDiff.added.length} 条</span></div>
              <div><strong>修改词条：</strong> <span style={{ color: 'var(--blue)' }}>{importDiff.modified.length} 条</span></div>
              <div><strong>无变化：</strong> <span style={{ color: 'var(--text-muted)' }}>{importDiff.unchanged.length} 条</span></div>
              {importDiff.removed.length > 0 && <span style={{ color: 'var(--red)' }}>CSV外 {importDiff.removed.length} 条 (不受影响)</span>}
            </div>

            {importDiff.added.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: 'var(--green)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>新增词条</h4>
                {importDiff.added.slice(0, 10).map((rec, i) => (
                  <div key={`add-${i}`} style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: '4px', padding: '0.4rem 0.6rem', marginBottom: '0.3rem', fontSize: '0.8rem' }}>
                    <strong>{rec.kw}</strong> - {rec.fields['CN（中文）'] || ''}
                  </div>
                ))}
                {importDiff.added.length > 10 && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>... 等共 {importDiff.added.length} 条</div>}
              </div>
            )}

            {importDiff.modified.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ color: 'var(--blue)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>修改词条</h4>
                {importDiff.modified.slice(0, 10).map((rec, i) => (
                  <div key={`mod-${i}`} style={{ background: 'var(--blue-bg)', border: '1px solid var(--blue)', borderRadius: '4px', padding: '0.4rem 0.6rem', marginBottom: '0.3rem', fontSize: '0.8rem' }}>
                    <strong>{rec.kw}</strong> - {rec.fields['CN（中文）'] || ''}
                    <div style={{ marginTop: '0.3rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--blue)' }}>
                      {Object.entries(rec.changes).map(([field, diff]) => (
                        <div key={field}>
                          <span style={{ color: 'var(--text-muted)' }}>{field}:</span>{' '}
                          <span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>{diff.old || '(空)'}</span>
                          {' -> '}
                          <span style={{ color: 'var(--green)' }}>{diff.new || '(空)'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {importDiff.modified.length > 10 && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>... 等共 {importDiff.modified.length} 条</div>}
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
              注：CSV 中不存在的词条（{importDiff.removed.length}条）将保持原样，不会被删除。
            </div>
          </div>
        </GlossaModal>
      )}
    </>
  );
}
