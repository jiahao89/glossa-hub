import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check, Loader2, Lock } from 'lucide-react';
import { BUILTIN_DIFY_PRESETS, getDifyDisplayLabel, matchBuiltinPreset } from '../utils/difyLabels';

// ============================================================
// DifySwitcher — 右上角 Dify 引擎切换器
//
// 显示当前生效的 Dify 引擎名(内置命中 → 预设名;自定义 → "自定义 · host")。
// owner 角色点击展开下拉,可切换到任一内置预设;
// 非 owner / 自定义配置 → 降级为只读状态指示器,引导去「翻译引擎设置」修改。
//
// 设计要点:
//   - 点击外部自动关闭 (mousedown 监听 + ref 校验)
//   - owner 切换 = 立即调 POST /api/projects/proj-default/dify, 成功后由 App.jsx 刷新 baseUrl
//   - 切换时锁定下拉,避免并发点击
//   - 错误时还原旧值 + toast 错误
// ============================================================

export default function DifySwitcher({
  baseUrl,
  connected,
  canSwitch,         // 当前用户是否有 owner 权限切换
  switching,         // 上层传入的"切换进行中"标志 (用于禁用交互)
  onSwitch,          // (newBaseUrl: string) => Promise<boolean>  (true=成功)
  onOpenSettings,    // () => void  (用于自定义降级时引导去设置)
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const activePresetId = matchBuiltinPreset(baseUrl);
  const isCustom = !activePresetId && !!baseUrl;
  const displayLabel = connected ? getDifyDisplayLabel(baseUrl) : '未配置';

  async function handlePick(preset) {
    if (switching) return;
    setOpen(false);
    if (preset.baseUrl === baseUrl) return; // no-op
    const ok = await onSwitch(preset.baseUrl);
    // 失败时上层已 toast, 无需额外处理
    void ok;
  }

  // 降级模式: 无连接或非 owner → 仅显示, 不展开下拉
  if (!connected) {
    return (
      <div role="status" aria-live="polite" style={styles.statusRow}>
        <Globe size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={styles.statusLabel}>Dify 翻译引擎状态:</span>
        <span style={styles.dotOff} />
        <span style={styles.textOff}>未配置</span>
      </div>
    );
  }

  if (!canSwitch || isCustom) {
    // 非 owner / 自定义配置: 显示状态 (locked style, 提示去设置)
    return (
      <div
        role="status"
        aria-live="polite"
        title={isCustom ? '当前为自定义引擎, 请到「翻译引擎设置」修改' : '当前用户无切换权限'}
        style={styles.statusRow}
      >
        <Globe size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={styles.statusLabel}>Dify:</span>
        <span style={styles.dotOn} />
        <span style={styles.textOn}>{displayLabel}</span>
        {isCustom && canSwitch && (
          <button
            onClick={onOpenSettings}
            style={styles.editBtn}
            title="前往翻译引擎设置"
            aria-label="前往翻译引擎设置"
          >
            <Lock size={11} />
          </button>
        )}
      </div>
    );
  }

  // 主路径: owner + 内置配置 → 可切换下拉
  return (
    <div ref={wrapRef} style={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={switching}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...styles.trigger,
          opacity: switching ? 0.6 : 1,
          cursor: switching ? 'wait' : 'pointer',
        }}
      >
        <Globe size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={styles.statusLabel}>Dify:</span>
        <span style={styles.dotOn} />
        <span style={styles.textOn}>{displayLabel}</span>
        {switching
          ? <Loader2 size={11} className="animate-spin" style={{ marginLeft: '4px' }} />
          : <ChevronDown size={11} style={{
              marginLeft: '2px',
              transition: 'transform 150ms',
              transform: open ? 'rotate(180deg)' : 'rotate(0)',
            }} />
        }
      </button>

      {open && (
        <div role="listbox" style={styles.menu}>
          <div style={styles.menuHeader}>切换 Dify 引擎</div>
          {BUILTIN_DIFY_PRESETS.map(p => {
            const active = p.id === activePresetId;
            return (
              <button
                key={p.id}
                role="option"
                aria-selected={active}
                onClick={() => handlePick(p)}
                style={{
                  ...styles.menuItem,
                  background: active ? 'var(--bg-tertiary, rgba(56, 189, 248, 0.08))' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bg-tertiary, rgba(255,255,255,0.05))';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                  <span style={{
                    fontSize: '0.78rem',
                    fontWeight: active ? 600 : 500,
                    color: 'var(--text-primary)',
                  }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {p.description}
                  </span>
                </div>
                {active && <Check size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={styles.menuFooter}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              需使用自定义地址? 请到「翻译引擎设置」
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Styles — 使用现有 design token, 与 App.jsx 保持一致
// ============================================================
const styles = {
  wrap: {
    position: 'relative',
    display: 'inline-flex',
  },
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-sm, 4px)',
    color: 'var(--text-secondary)',
    fontSize: '0.75rem',
    fontFamily: 'inherit',
    transition: 'background 150ms, border-color 150ms',
  },
  statusRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
  },
  statusLabel: {
    color: 'var(--text-secondary)',
  },
  dotOn: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--green)',
    boxShadow: '0 0 6px var(--green)',
  },
  dotOff: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--red)',
    boxShadow: '0 0 6px var(--red)',
  },
  textOn: {
    color: 'var(--green)',
    fontWeight: '500',
  },
  textOff: {
    color: 'var(--red)',
    fontWeight: '500',
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: '240px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md, 6px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 100,
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  menuHeader: {
    fontSize: '0.68rem',
    color: 'var(--text-muted)',
    padding: '6px 10px 4px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '8px 10px',
    border: 'none',
    borderRadius: 'var(--radius-sm, 4px)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    transition: 'background 100ms',
  },
  menuFooter: {
    padding: '6px 10px 4px',
    borderTop: '1px solid var(--border-color)',
    marginTop: '4px',
  },
  editBtn: {
    background: 'transparent',
    border: 'none',
    padding: '2px',
    marginLeft: '2px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'inline-flex',
    borderRadius: '3px',
  },
};