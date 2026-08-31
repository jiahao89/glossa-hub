import React from 'react';
import GlossaModal from '../GlossaModal';
import { Layers, Copy, CheckCircle } from 'lucide-react';

export function BatchCategoryModal({
  open,
  onClose,
  selectedCount,
  batchUpdateFields,
  setBatchUpdateFields,
  onSubmit,
  loading
}) {
  if (!open) return null;

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} style={{ color: 'var(--accent)' }} />
          <span>批量设置属性分类</span>
        </div>
      }
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={loading}>
            {loading ? '保存中...' : `确认为 ${selectedCount} 条词条设置`}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          为选中的 <strong style={{ color: 'var(--accent)' }}>{selectedCount}</strong> 条词条统一设置页面或负责人属性（留空表示不改动对应属性）：
        </p>

        <div className="form-group">
          <label className="form-label">所在页面 / 模块</label>
          <input
            type="text"
            className="input-field"
            placeholder="如: 骑行设置界面"
            value={batchUpdateFields.context}
            onChange={(e) => setBatchUpdateFields(prev => ({ ...prev, context: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">字号类别 / 负责人</label>
          <input
            type="text"
            className="input-field"
            placeholder="如: 标题 / 王赵云"
            value={batchUpdateFields.owner}
            onChange={(e) => setBatchUpdateFields(prev => ({ ...prev, owner: e.target.value }))}
          />
        </div>
      </div>
    </GlossaModal>
  );
}

export function BatchCopyModal({
  open,
  onClose,
  selectedCount,
  tables = [],
  currentTableId,
  batchCopyTargetTableId,
  setBatchCopyTargetTableId,
  duplicateStrategy,
  setDuplicateStrategy,
  onSubmit,
  loading
}) {
  if (!open) return null;

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Copy size={18} style={{ color: 'var(--accent)' }} />
          <span>批量复制词条到其他数据表</span>
        </div>
      }
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={loading || !batchCopyTargetTableId}>
            {loading ? '复制中...' : `确认复制 ${selectedCount} 条记录`}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          将选中的 <strong style={{ color: 'var(--accent)' }}>{selectedCount}</strong> 条词条复制到目标固件大表：
        </p>

        <div className="form-group">
          <label className="form-label">目标数据表</label>
          <select
            className="input-field"
            value={batchCopyTargetTableId}
            onChange={(e) => setBatchCopyTargetTableId(e.target.value)}
          >
            <option value="">-- 请选择目标固件大表 --</option>
            {tables
              .filter(t => t.id !== currentTableId)
              .map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">重复 KW 策略</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="radio"
                name="duplicateStrategy"
                value="skip"
                checked={duplicateStrategy === 'skip'}
                onChange={() => setDuplicateStrategy('skip')}
              />
              <span>跳过（若目标表中已有同名 KW 则跳过）</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="radio"
                name="duplicateStrategy"
                value="overwrite"
                checked={duplicateStrategy === 'overwrite'}
                onChange={() => setDuplicateStrategy('overwrite')}
              />
              <span>覆盖（用当前被复制词条覆盖目标表同名 KW 数据，锁定词条除外）</span>
            </label>
          </div>
        </div>
      </div>
    </GlossaModal>
  );
}

export function BatchApproveModal({
  open,
  onClose,
  selectedCount,
  status,
  setStatus,
  rejectReason,
  setRejectReason,
  onSubmit,
  loading
}) {
  if (!open) return null;

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={18} style={{ color: 'var(--green)' }} />
          <span>批量审核选中的词条</span>
        </div>
      }
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={loading}>
            {loading ? '提交中...' : `确认审核 ${selectedCount} 条记录`}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          批量修改选中的 <strong style={{ color: 'var(--accent)' }}>{selectedCount}</strong> 条词条的审核状态：
        </p>

        <div className="form-group">
          <label className="form-label">目标审核状态</label>
          <select
            className="input-field"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="APPROVED">APPROVED (通过)</option>
            <option value="PUBLISHED">PUBLISHED (已发布上线)</option>
            <option value="PENDING_REVIEW">PENDING_REVIEW (待审核)</option>
            <option value="DRAFT">DRAFT (草稿箱)</option>
            <option value="REJECTED">REJECTED (已驳回/待修改)</option>
          </select>
        </div>

        {status === 'REJECTED' && (
          <div className="form-group">
            <label className="form-label">驳回理由说明</label>
            <textarea
              className="input-field"
              rows={3}
              placeholder="请输入具体修改建议或驳回说明..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        )}
      </div>
    </GlossaModal>
  );
}
