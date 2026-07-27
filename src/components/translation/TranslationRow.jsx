import React, { memo } from 'react';
import { Lock, Unlock, Edit2, Bot, Check, Loader2 } from 'lucide-react';

const TranslationRow = memo(function TranslationRow({
  rec,
  index,
  safePage,
  pageSize,
  isSelected,
  onToggleSelect,
  isLocked,
  lockLoadingId,
  onToggleLock,
  currentUserRole,
  projectRole,
  kw,
  zh,
  page,
  owner,
  rowModified = {},
  targetLanguages = [],
  visibleLanguages = [],
  getRecordValueByName,
  onEditClick
}) {
  const recId = rec.recordId || rec.id;
  const canManageLock = currentUserRole === 'admin' || projectRole === 'owner';

  return (
    <tr style={{ background: isSelected ? 'rgba(59, 130, 246, 0.05)' : undefined }}>
      <td style={{ textAlign: 'center', width: '38px' }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(recId, e.target.checked)}
        />
      </td>

      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', width: '45px' }}>
        {(safePage - 1) * pageSize + index + 1}
      </td>

      <td style={{ textAlign: 'center', width: '70px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          {lockLoadingId === recId ? (
            <Loader2 className="animate-spin" size={12} color="var(--accent)" />
          ) : isLocked ? (
            <Lock
              size={12}
              style={{ color: 'var(--red)', cursor: canManageLock ? 'pointer' : 'not-allowed' }}
              onClick={(e) => {
                e.stopPropagation();
                if (canManageLock) onToggleLock(recId, true);
              }}
              title={canManageLock ? '点击解锁此行' : '已被管理员锁定只读'}
            />
          ) : (
            <Unlock
              size={12}
              className="unlock-icon-hover"
              style={{ color: 'var(--text-muted)', opacity: 0.25, cursor: canManageLock ? 'pointer' : 'default' }}
              onClick={(e) => {
                e.stopPropagation();
                if (canManageLock) onToggleLock(recId, false);
              }}
              title={canManageLock ? '点击锁定此行' : '未锁定'}
            />
          )}

          {(() => {
            const recStatus = rec.status || 'DRAFT';
            const badgeBase = {
              backgroundColor: 'transparent',
              fontSize: '0.68rem',
              fontWeight: '400',
              padding: '0.05rem 0.35rem',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: '3px',
              lineHeight: '1.4'
            };
            if (recStatus === 'DRAFT' || recStatus === 'PENDING_REVIEW' || recStatus === 'TRANSLATING') {
              return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--yellow)', borderColor: 'var(--yellow)' }}>待审核</span>;
            } else if (recStatus === 'APPROVED') {
              return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--green)', borderColor: 'var(--green)' }}>已审核</span>;
            } else if (recStatus === 'REJECTED') {
              return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--red)', borderColor: 'var(--red)' }} title={rec.rejectReason || '已驳回'}>已驳回</span>;
            } else if (recStatus === 'PUBLISHED') {
              return <span className="diff-tag" style={{ ...badgeBase, color: 'var(--purple)', borderColor: 'var(--purple)' }}>已发布</span>;
            }
            return null;
          })()}
        </div>
      </td>

      <td className={`sticky-col-1 mono ${rowModified.isAdded ? 'cell-added' : ''}`} title={kw}>{kw}</td>
      <td className={`sticky-col-2 ${rowModified.isAdded ? 'cell-added' : ''}`} title={zh} style={{ fontWeight: '500' }}>{zh}</td>
      <td className={rowModified.isAdded ? 'cell-added' : ''} title={page}>{page || <span className="cell-empty">未填</span>}</td>
      <td className={rowModified.isAdded ? 'cell-added' : ''} title={owner}>{owner || <span className="cell-empty">未填</span>}</td>

      {/* Progress Bar Mini Indicator */}
      {(() => {
        const totalLangs = targetLanguages.length;
        const translatedCount = targetLanguages.reduce((count, lang) => {
          const val = getRecordValueByName(rec, lang);
          return val && String(val).trim() ? count + 1 : count;
        }, 0);
        const pct = totalLangs > 0 ? Math.round((translatedCount / totalLangs) * 100) : 0;
        const color = translatedCount === 0 ? 'var(--red)'
          : pct < 50 ? 'var(--yellow)'
          : pct < 100 ? 'var(--accent)'
          : 'var(--green)';

        return (
          <td style={{ textAlign: 'center', padding: '0 0.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div style={{ width: '36px', height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
              </div>
              <span style={{ fontVariantNumeric: 'tabular-nums', color }}>
                {translatedCount}/{totalLangs}
              </span>
            </div>
          </td>
        );
      })()}

      {/* Dynamic Languages Cells */}
      {targetLanguages.map(lang => {
        if (!visibleLanguages.includes(lang)) return null;
        const val = getRecordValueByName(rec, lang);
        const isModified = rowModified[lang];
        const isAdded = rowModified.isAdded;
        const source = rec.translationsMeta?.[lang];
        const isAiSource = source === 'ai';
        const isTmSource = source === 'tm';

        let cellClass = '';
        if (isModified) {
          cellClass = 'cell-modified';
        } else if (isAdded) {
          cellClass = 'cell-added';
        }

        return (
          <td
            key={lang}
            className={cellClass}
            title={val ? `${val}${isAiSource ? ' (AI 翻译)' : isTmSource ? ' (翻译记忆)' : ''}` : undefined}
          >
            {val ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', width: '100%' }}>
                {isAiSource && <Bot size={11} style={{ flexShrink: 0, color: 'var(--purple)' }} />}
                {isTmSource && <Check size={11} style={{ flexShrink: 0, color: 'var(--green)' }} />}
                <span className="truncate" style={{ flex: 1, minWidth: 0 }}>{val}</span>
              </span>
            ) : <span className="cell-empty">未翻译</span>}
          </td>
        );
      })}

      <td style={{ textAlign: 'center' }}>
        <button
          onClick={() => onEditClick(rec)}
          className="btn btn-secondary btn-icon-only"
          style={{ height: '24px', width: '24px' }}
          title="双击或点击编辑词条"
        >
          <Edit2 size={12} />
        </button>
      </td>
    </tr>
  );
});

export default TranslationRow;
