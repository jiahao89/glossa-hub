import React, { useState } from 'react';
import GlossaModal from '../GlossaModal';
import { apiFetch } from '../../utils/api';
import { useToast } from '../Toast';

export default function AddTermModal({ open, onClose, selectedTableId, targetLanguages = [], onAddSuccess }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  
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
      closeDisabled={loading}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary" disabled={loading}>取消</button>
          <button onClick={handleAddSubmit} className="btn btn-primary" disabled={loading}>
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
            disabled={loading}
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
            disabled={loading}
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
            disabled={loading}
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
            disabled={loading}
          />
        </div>

        <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            目标语言翻译
          </h4>
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
              disabled={loading}
            />
          </div>
        ))}
      </div>
    </GlossaModal>
  );
}
