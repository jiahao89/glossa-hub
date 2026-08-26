import React, { memo } from 'react';
import { Lock, Unlock, Edit2, Bot, Check, Loader2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatDateTime } from '../../utils/dateTime';

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

  // Row-level keyboard nav: Enter opens the edit modal. We bail when the
  // user is already focused inside an interactive child (input/button/link)
  // so we don't double-trigger or fight the inline editor's own keybinds.
  const handleRowKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target;
    // Don't hijack Enter when focus is on an input/button/select inside the row
    if (target && target !== e.currentTarget) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
    }
    e.preventDefault();
    onEditClick(rec);
  };

  // 双击整行触发编辑 (Enter 已有, 双击是常见肌肉记忆).
  // 如果目标在按钮上 (如锁定 / 编辑按钮), 让按钮自身的 onClick 接管,
  // 不重复触发 onEditClick.
  const handleRowDoubleClick = (e) => {
    const target = e.target;
    if (target && target !== e.currentTarget) {
      const tag = target.tagName;
      const closestButton = target.closest && target.closest('button');
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || closestButton) {
        return;
      }
    }
    onEditClick(rec);
  };

  return (
    <tr
      aria-selected={isSelected || undefined}
      tabIndex={0}
      onKeyDown={handleRowKeyDown}
      onDoubleClick={handleRowDoubleClick}
      style={{ cursor: 'pointer' }}
      aria-label={kw ? `词条 ${kw}，按 Enter 或双击编辑` : undefined}
    >
      <td style={{ textAlign: 'center', width: '38px' }}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(recId, e.target.checked)}
        />
      </td>

      <td
        style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', width: '45px' }}
        title={rec.updatedAt ? `最近更新时间: ${formatDateTime(rec.updatedAt)}${rec.createdAt ? `\n创建录入时间: ${formatDateTime(rec.createdAt)}` : ''}` : undefined}
      >
        {(safePage - 1) * pageSize + index + 1}
      </td>

      <td style={{ textAlign: 'center', width: '70px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          {lockLoadingId === recId ? (
            <Loader2 className="animate-spin" size={12} color="var(--accent)" aria-label="正在切换锁定状态" />
          ) : (
            <button
              type="button"
              className="lock-toggle-btn"
              aria-pressed={isLocked}
              aria-label={
                isLocked
                  ? (canManageLock ? '已锁定,点击解锁此行' : '已被管理员锁定只读')
                  : (canManageLock ? '未锁定,点击锁定此行' : '未锁定')
              }
              disabled={!canManageLock}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(recId, isLocked);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '2px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                cursor: canManageLock ? 'pointer' : 'not-allowed',
                color: isLocked ? 'var(--red)' : 'var(--text-muted)',
                opacity: isLocked ? 1 : 0.4,
                transition: 'opacity 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (canManageLock) e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                if (!isLocked) e.currentTarget.style.opacity = '0.4';
              }}
            >
              {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          )}

          <StatusBadge status={rec.status || 'DRAFT'} rejectReason={rec.rejectReason} />
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
        // Color tiers — neutral for 0% (it's a normal initial state, not an
        // error), warning for partial, accent for in-progress, success for done.
        const color = translatedCount === 0 ? 'var(--text-muted)'
          : pct < 50 ? 'var(--yellow)'
          : pct < 100 ? 'var(--accent)'
          : 'var(--green)';

        return (
          <td style={{ textAlign: 'center', padding: '0 0.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div style={{ width: '36px', height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
              </div>
              <span style={{ fontVariantNumeric: 'tabular-nums', color, fontWeight: 600 }}>
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
          style={{ height: '32px', width: '32px' }}  /* WCAG 2.5.5 touch target ≥ 24-32px */
          title="双击或点击编辑词条"
        >
          <Edit2 size={13} />
        </button>
      </td>
    </tr>
  );
});

export default TranslationRow;
