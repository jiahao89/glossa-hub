import React, { useState } from 'react';
import GlossaModal from '../GlossaModal';
import { Layers, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { useToast } from '../Toast';

// ============================================================
// InheritModal — 翻译记忆库继承
//
// 从选定的源大表继承翻译, 覆盖当前大表中未翻译的语种 cell。
// 跳过已锁定的词条; 后端在事务中处理, 完成后写一条 '翻译继承' 审计日志。
//
// 用途: 译员从老表(例如 "国内 2.0")继承补全新表(例如 "海外 2.1")
// 的未翻译 cell, 避免逐条手抄。
//
// 用法:
//   <InheritModal
//     open={inheritOpen}
//     onClose={() => setInheritOpen(false)}
//     currentTableId={selectedTableId}        // 目标表
//     tables={tables}                         // 候选源表 (排除自身)
//     onSuccess={() => loadTableData(selectedTableId)}
//   />
// ============================================================

export default function InheritModal({ open, onClose, currentTableId, tables = [], onSuccess }) {
  const toast = useToast();
  const [sourceId, setSourceId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 打开时默认选第一张其他表
  React.useEffect(() => {
    if (open) {
      const firstOther = (tables || []).find(t => t.id !== currentTableId);
      setSourceId(firstOther ? firstOther.id : '');
    }
  }, [open, currentTableId, tables]);

  const handleSubmit = async () => {
    if (!sourceId) {
      toast.error('请选择源大表');
      return;
    }
    if (sourceId === currentTableId) {
      toast.error('源表不能是当前表本身');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/versions/${currentTableId}/inherit-translations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceVersionId: sourceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '继承失败');
      }
      const data = await res.json();
      const n = data.inheritedCount || 0;
      if (n === 0) {
        toast.info('继承完成, 但没有可补全的空白 cell (源表翻译已全部存在)');
      } else {
        toast.success(data.message || `成功继承 ${n} 条词条`);
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || '继承失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 只列出非自身的表作为源
  const sourceOptions = (tables || []).filter(t => t.id !== currentTableId);

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} style={{ color: 'var(--accent)' }} />
          <span>从其他大表继承翻译</span>
        </div>
      }
      maxWidth="520px"
      closeDisabled={submitting}
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary" disabled={submitting}>
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!sourceId || submitting}
            className="btn btn-primary"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                <span style={{ marginLeft: '0.4rem' }}>正在合并继承...</span>
              </>
            ) : (
              '开始继承'
            )}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{
          padding: '0.6rem 0.75rem',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          💡 <strong>翻译记忆库继承</strong>: 从选定的源大表读取每个词条的翻译,
          对当前大表的<strong>空白 cell</strong>(未翻译)做覆盖式补全。
          跳过已锁定的词条。已翻译的内容不会被覆盖。
        </div>

        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>
            继承源大表
          </label>
          {sourceOptions.length === 0 ? (
            <div style={{ padding: '0.6rem', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.82rem' }}>
              ⚠️ 当前项目下没有其他大表可作为继承源。请先在「数据表管理」中创建更多版本。
            </div>
          ) : (
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={submitting}
              className="select-input"
              style={{ width: '100%', height: '36px', fontSize: '0.85rem' }}
            >
              {sourceOptions.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            选定源表后, 系统会按 KW 匹配, 把源表里有但当前表对应 cell 为空的翻译拷贝过来。
          </div>
        </div>

        <div style={{
          padding: '0.5rem 0.75rem',
          background: 'var(--yellow-bg)',
          color: 'var(--yellow)',
          border: '1px solid rgba(var(--yellow-rgb, 245, 158, 11), 0.2)',
          borderRadius: '4px',
          fontSize: '0.78rem',
          lineHeight: 1.4,
        }}>
          ⚠️ 此操作会修改当前大表中的多条词条, 完成后会写一条「翻译继承」审计日志。
        </div>
      </div>
    </GlossaModal>
  );
}