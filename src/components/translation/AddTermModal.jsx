import React, { useState } from 'react';
import GlossaModal from '../GlossaModal';
import { apiFetch } from '../../utils/api';
import { useToast } from '../Toast';
import { Loader2, Sparkles } from 'lucide-react';

function findTranslationForLang(result, targetLang) {
  if (!result || typeof result !== 'object') return undefined;
  if (result[targetLang] !== undefined) return result[targetLang];
  
  const codeMatch = targetLang.match(/^([A-Z]+)/i);
  const code = codeMatch ? codeMatch[1].toUpperCase() : '';
  const nameClean = targetLang.replace(/^[A-Z]+\s*[（(]?/i, '')
                              .replace(/[）)]?$/g, '')
                              .replace(/语|文/g, '')
                              .trim();

  for (const [k, v] of Object.entries(result)) {
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const kUpper = k.toUpperCase().trim();
    const kClean = k.replace(/[（()）]/g, '').replace(/语|文/g, '').trim();

    if (code && (kUpper === code || kUpper.startsWith(code + '_') || kUpper.startsWith(code + '-'))) {
      return v;
    }
    if (nameClean && (kClean.includes(nameClean) || nameClean.includes(kClean))) {
      return v;
    }
  }
  return undefined;
}

export default function AddTermModal({ open, onClose, selectedTableId, targetLanguages = [], onAddSuccess }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  
  // Initialize state based on fields
  const getInitialFields = () => {
    const fields = {
      '所在页面': '',
      '字号类别': '',
      'KW': '',
      'CN（中文）': ''
    };
    targetLanguages.forEach(lang => {
      fields[lang] = '';
    });
    return fields;
  };

  const [newFields, setNewFields] = useState(getInitialFields());

  const handleFieldChange = (field, value) => {
    setNewFields(prev => ({ ...prev, [field]: value }));
  };

  const handleAutoTranslate = async () => {
    if (!newFields['CN（中文）']?.trim()) {
      toast.error('请先输入中文源文本');
      return;
    }

    setIsTranslating(true);
    try {
      const inputs = {
        KW: newFields.KW || '',
        text: newFields['CN（中文）'],
        context: newFields['所在页面'] || '无',
        target_languages: targetLanguages.join(',')
      };

      const res = await apiFetch(`/api/projects/proj-default/ai-translate?debug=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || '翻译接口调用失败');
      }

      const result = await res.json();
      const updates = {};
      targetLanguages.forEach(lang => {
        const val = findTranslationForLang(result, lang);
        if (val) {
          updates[lang] = val;
        }
      });

      if (Object.keys(updates).length > 0) {
        setNewFields(prev => ({ ...prev, ...updates }));
        toast.success('AI 翻译完成！');
      } else {
        toast.info('AI 未返回对应的语言翻译，请检查目标语言');
      }
    } catch (err) {
      console.error('翻译失败:', err);
      toast.error(`翻译失败: ${err.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTableId) {
      toast.error('请先选择一个数据表');
      return;
    }

    if (!newFields.KW?.trim() && !newFields['CN（中文）']?.trim()) {
      toast.error('KW 或 CN（中文）不能同时为空');
      return;
    }

    setLoading(true);
    try {
      const addedForSync = [{
        recordId: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fields: newFields
      }];

      const res = await apiFetch(`/api/tables/${selectedTableId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ added: addedForSync, updated: [] })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '新增失败');
      }

      toast.success('新增词条成功');
      setNewFields(getInitialFields());
      onAddSuccess(addedForSync[0]);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <GlossaModal
      isOpen={true}
      onClose={onClose}
      title="新增翻译词条"
      closeDisabled={loading || isTranslating}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary" disabled={loading || isTranslating}>取消</button>
          <button onClick={handleAddSubmit} className="btn btn-primary" disabled={loading || isTranslating}>
            {loading ? '保存中...' : '保存新增'}
          </button>
        </>
      }
    >
      <div className="edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '0.5rem 0' }}>
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-muted)' }}>
            KW 标识 (例如: KW_AVG_CADENCE)
          </label>
          <input 
            type="text" 
            value={newFields['KW']} 
            onChange={(e) => handleFieldChange('KW', e.target.value)}
            className="input-text"
            style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            disabled={loading || isTranslating}
            placeholder="请输入 KW..."
          />
        </div>
        
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-muted)' }}>
            CN（中文）(源文本)
          </label>
          <input 
            type="text" 
            value={newFields['CN（中文）']} 
            onChange={(e) => handleFieldChange('CN（中文）', e.target.value)}
            className="input-text"
            style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            disabled={loading || isTranslating}
            placeholder="请输入中文源文本..."
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-muted)' }}>
            所在页面
          </label>
          <input 
            type="text" 
            value={newFields['所在页面']} 
            onChange={(e) => handleFieldChange('所在页面', e.target.value)}
            className="input-text"
            style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            disabled={loading || isTranslating}
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-muted)' }}>
            字号类别
          </label>
          <input 
            type="text" 
            value={newFields['字号类别']} 
            onChange={(e) => handleFieldChange('字号类别', e.target.value)}
            className="input-text"
            style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            disabled={loading || isTranslating}
          />
        </div>

        <div style={{ gridColumn: 'span 2', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '0', color: 'var(--text-primary)' }}>
            目标语言翻译
          </h4>
          <button 
            type="button"
            onClick={handleAutoTranslate}
            disabled={loading || isTranslating || !newFields['CN（中文）']?.trim()}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.6rem' }}
          >
            {isTranslating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} style={{ color: 'var(--purple)' }} />}
            {isTranslating ? '翻译中...' : '一键 AI 翻译'}
          </button>
        </div>

        {targetLanguages.map(lang => (
          <div key={lang} className="form-group">
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-muted)' }}>
              {lang}
            </label>
            <input 
              type="text" 
              value={newFields[lang] || ''} 
              onChange={(e) => handleFieldChange(lang, e.target.value)}
              className="input-text"
              style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              disabled={loading || isTranslating}
            />
          </div>
        ))}
      </div>
    </GlossaModal>
  );
}
