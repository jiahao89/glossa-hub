import React from 'react';
import GlossaModal from '../GlossaModal';
import { History, RotateCcw } from 'lucide-react';

export default function HistoryModal({
  open,
  onClose,
  snapshots = [],
  loadingSnapshots = false,
  rollingBackId = '',
  onRollbackSnapshot,
  currentRecord = null
}) {
  if (!open || !currentRecord) return null;

  return (
    <GlossaModal
      isOpen={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} style={{ color: 'var(--accent)' }} />
          <span>词条修改历史快照库</span>
        </div>
      }
      footer={
        <button className="btn btn-secondary" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
        <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>当前词条 (KW)</div>
          <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{currentRecord.KW}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>中文源词: {currentRecord['CN（中文）']}</div>
        </div>

        {loadingSnapshots ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            正在读取快照版本...
          </div>
        ) : snapshots.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            该词条暂无历史快照版本记录
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {snapshots.map((snap) => {
              const isRollingBack = rollingBackId === snap.id;
              const transObj = snap.translations || {};
              const langKeys = Object.keys(transObj);

              return (
                <div
                  key={snap.id}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      快照时间: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{snap.createdAt ? new Date(snap.createdAt).toLocaleString() : '-'}</span>
                      <span style={{ marginLeft: '12px' }}>操作者: {snap.creatorName || '未知'}</span>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onRollbackSnapshot(snap.id)}
                      disabled={isRollingBack}
                      style={{ gap: '4px' }}
                    >
                      <RotateCcw size={14} />
                      <span>{isRollingBack ? '回退中...' : '回退至此版本'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', background: 'var(--bg-secondary)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                    {langKeys.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>无译文数据</span>
                    ) : (
                      langKeys.map(lang => (
                        <div key={lang} style={{ fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{lang}: </span>
                          <span style={{ color: 'var(--text-primary)' }}>{transObj[lang]}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GlossaModal>
  );
}
