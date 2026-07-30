import React, { useState } from 'react';
import GlossaModal from '../GlossaModal';
import { apiFetch } from '../../utils/api';
import { useToast } from '../Toast';
import { Plus, Trash2 } from 'lucide-react';

export default function BatchAddModal({ open, onClose, selectedTableId, onAddSuccess }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  
  const getEmptyRow = () => ({
    id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    KW: '',
    'CN（中文）': '',
    '所在页面': '',
    '字号类别': ''
  });

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

  const handleBatchAddSubmit = async () => {
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
      const addedForSync = validRows.map(r => {
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
        throw new Error(data.error || '批量新增失败');
      }

      toast.success(`成功批量新增 ${addedForSync.length} 条记录`);
      setRows(Array.from({ length: 5 }, getEmptyRow));
      onAddSuccess(addedForSync);
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
      title="批量新增词条"
      maxWidth="1100px"
      closeDisabled={loading}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary" disabled={loading}>取消</button>
          <button onClick={handleBatchAddSubmit} className="btn btn-primary" disabled={loading}>
            {loading ? '保存中...' : `保存有效词条 (${rows.filter(r => r.KW?.trim() || r['CN（中文）']?.trim()).length}条)`}
          </button>
        </>
      }
    >
      <div style={{ padding: '0 0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          * 留空的行在保存时会自动被忽略。至少需要填写 KW 或 中文。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 40px', gap: '0.5rem', padding: '0.5rem 0', fontWeight: '500', color: 'var(--text-muted)', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' }}>
            <div>KW 标识</div>
            <div>CN（中文）</div>
            <div>所在页面</div>
            <div>字号类别</div>
            <div style={{ textAlign: 'center' }}>操作</div>
          </div>

          {/* Rows */}
          {rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 40px', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="KW_..."
                className="input-text"
                value={row.KW}
                onChange={(e) => updateRow(row.id, 'KW', e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              />
              <input
                type="text"
                placeholder="中文文本..."
                className="input-text"
                value={row['CN（中文）']}
                onChange={(e) => updateRow(row.id, 'CN（中文）', e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              />
              <input
                type="text"
                placeholder="页面..."
                className="input-text"
                value={row['所在页面']}
                onChange={(e) => updateRow(row.id, '所在页面', e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              />
              <input
                type="text"
                placeholder="类别..."
                className="input-text"
                value={row['字号类别']}
                onChange={(e) => updateRow(row.id, '字号类别', e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              />
              <button
                onClick={() => removeRow(row.id)}
                disabled={loading || rows.length === 1}
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
            disabled={loading}
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
