import React, { useState } from 'react';
import GlossaModal from '../GlossaModal';
import { apiFetch } from '../../utils/api';
import { useToast } from '../Toast';
import { Plus, Trash2, Loader2, Sparkles } from 'lucide-react';

function findTranslationForLang(result, targetLang) {
  if (!result || typeof result !== 'object') return undefined;
  if (result[targetLang] !== undefined) return result[targetLang];
  
  const codeMatch = targetLang.match(/^([A-Z]+)/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : '';
  const nameClean = targetLang.replace(/^[A-Z]+\s*[\（\(]?/i, '')
                              .replace(/[\）\)]?$/g, '')
                              .replace(/语|文/g, '')
                              .trim();

  for (const [k, v] of Object.entries(result)) {
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const kUpper = k.toUpperCase().trim();
    const kClean = k.replace(/[\（\(\）\)]/g, '').replace(/语|文/g, '').trim();

    if (code && (kUpper === code || kUpper.startsWith(code + '_') || kUpper.startsWith(code + '-'))) {
      return v;
    }
    if (nameClean && (kClean.includes(nameClean) || nameClean.includes(kClean))) {
      return v;
    }
  }
  return undefined;
}

export default function BatchAddModal({ open, onClose, selectedTableId, onAddSuccess, targetLanguages = [], difyConfig = {} }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState({ total: 0, current: 0, status: '' });
  
  const getEmptyRow = () => {
    const row = {
      id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      KW: '',
      'CN（中文）': '',
      '所在页面': '',
      '字号类别': ''
    };
    targetLanguages.forEach(lang => {
      row[lang] = '';
    });
    return row;
  };

  const [rows, setRows] = useState(Array.from({ length: 5 }, getEmptyRow));

  const updateRow = (id, field, value) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRow = (id) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const addRow = () => {
    setRows([...rows, getEmptyRow()]);
  };

  const saveToBackend = async (rowsToSave) => {
    const addedForSync = rowsToSave.map(r => {
      const { id: _id, ...fields } = r;
      return {
        recordId: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fields
      };
    });

    const res = await apiFetch(`/api/tables/${selectedTableId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ added: addedForSync, updated: [] })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '批量新增写入失败');
    }

    toast.success(`成功批量新增 ${addedForSync.length} 条记录`);
    setRows(Array.from({ length: 5 }, getEmptyRow));
    onAddSuccess(addedForSync);
    onClose();
  };

  const handleDirectSave = async () => {
    if (!selectedTableId) {
      toast.error('请先选择一个数据表');
      return;
    }

    const validRows = rows.filter(r => r.KW?.trim() || r['CN（中文）']?.trim());
    if (validRows.length === 0) {
      toast.error('没有有效的词条可以保存 (KW或中文不能同时为空)');
      return;
    }

    setLoading(true);
    try {
      await saveToBackend(validRows);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTranslateAndSave = async () => {
    if (!selectedTableId) {
      toast.error('请先选择一个数据表');
      return;
    }

    const validRows = rows.filter(r => r.KW?.trim() || r['CN（中文）']?.trim());
    if (validRows.length === 0) {
      toast.error('没有有效的词条可以翻译');
      return;
    }

    setIsTranslating(true);
    let updatedRows = [...rows];
    let translatedRows = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setProgress({
        total: validRows.length,
        current: i + 1,
        status: `正在翻译 (${i + 1}/${validRows.length}): ${row.KW || row['CN（中文）']}`
      });

      // We only translate if Chinese is provided, otherwise we just keep it
      if (row['CN（中文）']?.trim()) {
        try {
          const inputs = {
            KW: row.KW || '',
            text: row['CN（中文）'],
            context: row['所在页面'] || '无',
            target_languages: targetLanguages.join(',')
          };

          const res = await apiFetch(`/api/projects/proj-default/ai-translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs })
          });
          
          if (!res.ok) {
             const error = await res.json();
             throw new Error(error.error || '翻译接口失败');
          }
          
          const result = await res.json();
          
          targetLanguages.forEach(lang => {
            const val = findTranslationForLang(result, lang);
            if (val) {
              row[lang] = val;
            }
          });
          
          if (result._source === 'tm') {
            row.tmMatch = true;
          }

          // Update UI incrementally
          updatedRows = updatedRows.map(r => r.id === row.id ? { ...row } : r);
          setRows(updatedRows);
        } catch (err) {
          console.error(`翻译词条 ${row.KW} 失败:`, err);
          toast.error(`翻译词条 ${row.KW || row['CN（中文）']} 失败: ${err.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      translatedRows.push(row);
    }

    setProgress({ total: validRows.length, current: validRows.length, status: '翻译完成，正在写入数据库...' });
    
    try {
      await saveToBackend(translatedRows);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsTranslating(false);
      setProgress({ total: 0, current: 0, status: '' });
    }
  };

  if (!open) return null;

  const validCount = rows.filter(r => r.KW?.trim() || r['CN（中文）']?.trim()).length;
  const isBusy = loading || isTranslating;

  // Calculate dynamic grid columns based on number of target languages
  // Base columns: KW, CN, 页面, 类别, Actions
  const numLangs = targetLanguages.length;
  // Make inputs a bit narrower to fit more columns
  const gridTemplateColumns = `1.5fr 1.5fr 1fr 1fr ${Array(numLangs).fill('1.5fr').join(' ')} 40px`;

  return (
    <GlossaModal
      isOpen={true}
      onClose={onClose}
      title="批量新增词条"
      maxWidth="90vw"
      closeDisabled={isBusy}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary" disabled={isBusy}>取消</button>
          <button onClick={handleDirectSave} className="btn btn-secondary" disabled={isBusy}>
            {loading ? <><Loader2 size={14} className="animate-spin" /> 保存中...</> : `直接保存 (${validCount}条)`}
          </button>
          <button onClick={handleTranslateAndSave} className="btn btn-primary" disabled={isBusy || targetLanguages.length === 0}>
            {isTranslating ? <><Loader2 size={14} className="animate-spin" /> 翻译并写入中...</> : <><Sparkles size={14} /> 自动翻译并录入 ({validCount}条)</>}
          </button>
        </>
      }
    >
      <div style={{ padding: '0 0.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            * 留空的行在保存时会自动被忽略。至少需要填写 KW 或 中文。
          </p>
          {targetLanguages.length === 0 && (
            <div className="alert-box alert-box-warning" style={{ margin: 0, padding: '0.4rem 0.8rem' }}>
              当前表没有检测到目标语言列，AI 翻译功能不可用
            </div>
          )}
        </div>

        {isTranslating && (
          <div className="alert-box alert-box-info" style={{ flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: '600' }}>{progress.status}</div>
            {progress.total > 0 && (
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.25rem' }}>
                <div
                  style={{
                    height: '100%',
                    backgroundColor: 'var(--accent)',
                    width: `${(progress.current / progress.total) * 100}%`,
                    transition: 'width 0.2s'
                  }}
                ></div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Header */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns, 
            gap: '0.5rem', padding: '0.5rem 0', fontWeight: '500', color: 'var(--text-muted)', fontSize: '0.8rem', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, backgroundColor: 'var(--bg-primary)', zIndex: 1 
          }}>
            <div>KW 标识</div>
            <div>CN（中文）</div>
            <div>所在页面</div>
            <div>字号类别</div>
            {targetLanguages.map(lang => (
              <div key={lang}>{lang}</div>
            ))}
            <div style={{ textAlign: 'center' }}>操作</div>
          </div>

          {/* Rows */}
          {rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns, gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="KW_..."
                className="input-text"
                value={row.KW}
                onChange={(e) => updateRow(row.id, 'KW', e.target.value)}
                disabled={isBusy}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem' }}
              />
              <input
                type="text"
                placeholder="中文文本..."
                className="input-text"
                value={row['CN（中文）']}
                onChange={(e) => updateRow(row.id, 'CN（中文）', e.target.value)}
                disabled={isBusy}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem' }}
              />
              <input
                type="text"
                placeholder="页面..."
                className="input-text"
                value={row['所在页面']}
                onChange={(e) => updateRow(row.id, '所在页面', e.target.value)}
                disabled={isBusy}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem' }}
              />
              <input
                type="text"
                placeholder="类别..."
                className="input-text"
                value={row['字号类别']}
                onChange={(e) => updateRow(row.id, '字号类别', e.target.value)}
                disabled={isBusy}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem' }}
              />
              
              {targetLanguages.map(lang => (
                <input
                  key={lang}
                  type="text"
                  placeholder={`${lang}...`}
                  className="input-text"
                  value={row[lang] || ''}
                  onChange={(e) => updateRow(row.id, lang, e.target.value)}
                  disabled={isBusy}
                  style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem', backgroundColor: row[lang] ? 'var(--bg-tertiary)' : 'var(--bg-secondary)' }}
                />
              ))}

              <button
                onClick={() => removeRow(row.id)}
                disabled={isBusy || rows.length === 1}
                style={{ 
                  background: 'none', border: 'none', color: rows.length === 1 ? 'var(--text-muted)' : 'var(--red)', 
                  cursor: rows.length === 1 ? 'not-allowed' : 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}
                title="删除此行"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          {/* Add Row Button */}
          <button
            onClick={addRow}
            disabled={isBusy}
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: 'flex-start', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
          >
            <Plus size={14} /> 增加一行
          </button>
        </div>
      </div>
    </GlossaModal>
  );
}
