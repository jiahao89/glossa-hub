import React, { useState, useEffect } from 'react';
import { Search, History, Trash2, Eye, User, RotateCcw, ChevronRight } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useToast } from './Toast';
import EmptyState from './EmptyState';
import GlossaModal from './GlossaModal';

export default function LogsTab() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVersion, setFilterVersion] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Diff Modal State
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [activeLog, setActiveLog] = useState(null);

  // Rollback State
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [rollbackLog, setRollbackLog] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [rollbackTermId, setRollbackTermId] = useState(null);
  const [rollingBack, setRollingBack] = useState(null); // R4: null 或正在回退的 snapshotId

  const fetchLogs = async () => {
    try {
      const res = await apiFetch('/api/logs');
      if (!res.ok) throw new Error('获取日志失败');
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClearAllLogs = async () => {
    const confirmClear = window.confirm(
      '⚠️ 您确认要清空系统内所有的历史协作修改日志吗？此操作不可逆！\n\n(注意: 这不会清空任何固件大表中的词条翻译本身)'
    );
    if (!confirmClear) return;

    try {
      const res = await apiFetch('/api/logs', {
        method: 'DELETE'
      });
      if (res.ok) {
        setLogs([]);
      } else {
        toast.error('清空日志失败');
      }
    } catch (err) {
      toast.error(`网络错误: ${err.message}`);
    }
  };

  // Derive unique versions from logs
  const versionsList = React.useMemo(() => {
    const set = new Set();
    logs.forEach(log => {
      if (log.version_name) set.add(log.version_name);
      else if (log.version) set.add(log.version);
    });
    return Array.from(set).sort();
  }, [logs]);

  // 操作人去重列表
  const operatorsList = React.useMemo(() => {
    const set = new Set();
    logs.forEach(log => {
      const op = log.operator_name || log.operator || '';
      if (op) set.add(op);
    });
    return Array.from(set).sort();
  }, [logs]);

  // 操作类型去重列表（基于 action 字段）
  const actionsList = React.useMemo(() => {
    const set = new Set();
    logs.forEach(log => {
      if (log.action) set.add(log.action);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Filtered Logs
  const filteredLogs = React.useMemo(() => {
    return logs.filter(log => {
      // 1. Text Search (KW / Chinese / Operator / Details)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const kw = (log.kw || '').toLowerCase();
        const chinese = (log.chinese || '').toLowerCase();
        const operator = (log.operator_name || log.operator || '未知用户').toLowerCase();
        const details = (log.details || '').toLowerCase();

        if (!kw.includes(query) && !chinese.includes(query) && !operator.includes(query) && !details.includes(query)) {
          return false;
        }
      }

      // 2. Version Filter
      const logVer = log.version_name || log.version;
      if (filterVersion && logVer !== filterVersion) {
        return false;
      }

      // 2b. Operator Filter
      const logOp = log.operator_name || log.operator || '';
      if (filterOperator && logOp !== filterOperator) {
        return false;
      }

      // 2c. Action Filter
      if (filterAction && log.action !== filterAction) {
        return false;
      }

      // 3. Date range filter
      if (log.timestamp) {
        const logDateStr = log.timestamp.split(' ')[0]; // Extract YYYY-MM-DD
        if (startDate && logDateStr < startDate) {
          return false;
        }
        if (endDate && logDateStr > endDate) {
          return false;
        }
      }

      return true;
    });
  }, [logs, searchQuery, filterVersion, filterOperator, filterAction, startDate, endDate]);

  const handleOpenDiff = (log) => {
    setActiveLog(log);
    setDiffModalOpen(true);
  };

  const handleOpenRollback = async (log) => {
    setRollbackLog(log);
    setRollbackModalOpen(true);
    setSnapshots([]);
    setSnapshotsLoading(true);
    setRollbackTermId(null);
    try {
      const versionName = log.version_name || log.version || '';
      const res = await apiFetch(`/api/terms/by-kw-version?kw=${encodeURIComponent(log.kw)}&versionName=${encodeURIComponent(versionName)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '查找失败');
      }
      const data = await res.json();
      setRollbackTermId(data.termId);
      setSnapshots(data.snapshots || []);
      if (data.isLocked) {
        toast.warning('该词条已被锁定，回退需要先解锁');
      }
    } catch (err) {
      toast.error(`获取历史快照失败: ${err.message}`);
    } finally {
      setSnapshotsLoading(false);
    }
  };

  const handleConfirmRollback = async (snapshotId) => {
    if (!rollbackTermId || !snapshotId) return;
    // R3: 二次确认
    const snap = snapshots.find(s => s.id === snapshotId);
    const confirmMsg = `⚠️ 警告：回退操作确认 ⚠️\n\n确认要将词条 [${rollbackLog?.kw}] 回退到 [${snap?.createdAt}] 的历史快照状态吗？\n\n此操作会覆盖该词条当前的所有语言翻译（系统已自动生成当前最新状态的备份快照以防数据丢失，您依然可以反向回退），确认是否继续回退？`;
    if (!window.confirm(confirmMsg)) return;
    setRollingBack(snapshotId); // R4: 记录正在回退的 snapshotId
    try {
      const res = await apiFetch(`/api/terms/${rollbackTermId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || '回退失败');
      }
      toast.success('词条已成功回退到历史版本');
      setRollbackModalOpen(false);
      fetchLogs();
    } catch (err) {
      toast.error(`回退失败: ${err.message}`);
    } finally {
      setRollingBack(null);
    }
  };

  const getBriefActionText = (log) => {
    try {
      const parsed = JSON.parse(log.details);
      if (parsed.field) {
        return `修改 [${parsed.field}] 翻译`;
      }
    } catch {
      // Normal string
    }
    return log.action || '数据变更';
  };

  const isJsonDetails = (details) => {
    try {
      const parsed = JSON.parse(details);
      return !!(parsed && parsed.field);
    } catch {
      return false;
    }
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '70vh' }}>
        <span>正在读取修改日志轨迹...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-center" style={{ height: '70vh', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ color: 'var(--red)' }}>⚠️ {error}</span>
        <button onClick={fetchLogs} className="btn btn-secondary">重试</button>
      </div>
    );
  }

  return (
    <div className="logs-container" style={{ padding: '1.5rem', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Title */}
      <div className="tab-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em' }}>词条修改日志</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>记录系统内所有用户对词条的大货导入、翻译覆盖与字段变更轨迹。</p>
        </div>
        <button 
          onClick={handleClearAllLogs}
          className="btn btn-secondary"
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
        >
          <Trash2 size={14} />
          <span>清空所有日志</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '1.5rem', alignItems: 'center', flexShrink: 0 }}>
        
        {/* Search */}
        <div style={{ flex: 2, minWidth: '200px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 KW / 中文 / 操作人 / 动作描述..."
            className="text-input"
            style={{ paddingLeft: '2rem', height: '34px', fontSize: '0.82rem' }}
          />
        </div>

        {/* Version Selector */}
        <div style={{ flex: 1, minWidth: '120px' }}>
          <select
            value={filterVersion}
            onChange={(e) => setFilterVersion(e.target.value)}
            className="text-input"
            style={{ height: '34px', padding: '0 0.5rem', fontSize: '0.82rem' }}
          >
            <option value="">所有版本大表</option>
            {versionsList.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        {/* Operator Selector */}
        <div style={{ flex: 1, minWidth: '120px' }}>
          <select
            value={filterOperator}
            onChange={(e) => setFilterOperator(e.target.value)}
            className="text-input"
            style={{ height: '34px', padding: '0 0.5rem', fontSize: '0.82rem' }}
            title="按操作人筛选"
          >
            <option value="">所有操作人</option>
            {operatorsList.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </div>

        {/* Action Selector */}
        <div style={{ flex: 1, minWidth: '140px' }}>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="text-input"
            style={{ height: '34px', padding: '0 0.5rem', fontSize: '0.82rem' }}
            title="按操作类型筛选"
          >
            <option value="">所有操作类型</option>
            {actionsList.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>

        {/* Date Ranges */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input 
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-input"
            style={{ height: '34px', fontSize: '0.82rem', padding: '0 0.5rem', width: '125px' }}
          />
          <span style={{ color: 'var(--text-muted)' }}>至</span>
          <input 
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-input"
            style={{ height: '34px', fontSize: '0.82rem', padding: '0 0.5rem', width: '125px' }}
          />
        </div>

      </div>

      {/* Logs Table Wrapper */}
      <div className="table-wrapper" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)', overflowY: 'auto', flex: 1 }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', height: '38px', position: 'sticky', top: 0, zIndex: 10 }}>
              <th style={{ padding: '0.75rem 1rem', width: '150px' }}>时间戳</th>
              <th style={{ padding: '0.75rem 1rem', width: '100px' }}>操作人</th>
              <th style={{ padding: '0.75rem 1rem', width: '120px' }}>固件版本大表</th>
              <th style={{ padding: '0.75rem 1rem', width: '180px' }}>词条 (KW)</th>
              <th style={{ padding: '0.75rem 1rem', width: '120px' }}>中文源词</th>
              <th style={{ padding: '0.75rem 1rem' }}>修改摘要</th>
              <th style={{ padding: '0.75rem 1rem', width: '100px', textAlign: 'center' }}>历史详情</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '0' }}>
                  <EmptyState
                    icon={History}
                    title={logs.length === 0 ? '暂无任何操作日志' : '没有找到符合筛选条件的日志'}
                    description={
                      logs.length === 0
                        ? '在“词条管理”页面编辑、审核或同步词条后，操作记录会自动显示在这里。'
                        : '试试清除部分筛选条件（操作人/操作类型/版本/日期范围）扩大查询范围。'
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => {
                const isDiff = isJsonDetails(log.details);
                return (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)', height: '40px', cursor: 'pointer' }} onDoubleClick={() => handleOpenDiff(log)}>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{log.timestamp}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <User size={12} style={{ color: 'var(--text-muted)' }} />
                        {log.operator_name || log.operator || '未知用户'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{log.version_name || log.version || '通用'}</td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '200px' }}>
                      <code className="truncate" style={{ display: 'block', background: 'var(--bg-primary)', padding: '2px 5px', borderRadius: '4px', color: 'var(--accent)', fontSize: '0.75rem' }} title={log.kw || '-'}>
                        {log.kw || '-'}
                      </code>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', maxWidth: '300px' }} className="truncate" title={log.chinese || '-'}>{log.chinese || '-'}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                      {getBriefActionText(log)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                      {isDiff ? (
                        <button 
                          onClick={() => handleOpenDiff(log)}
                          className="btn btn-secondary"
                          style={{ height: '24px', padding: '0 0.4rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                        >
                          <Eye size={11} />
                          <span>对比 Diff</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleOpenDiff(log)}
                          className="btn btn-secondary"
                          style={{ height: '24px', padding: '0 0.4rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                        >
                          <Eye size={11} />
                          <span>查看</span>
                        </button>
                      )}
                      {log.kw && (log.version_name || log.version) && (
                        <button
                          onClick={() => handleOpenRollback(log)}
                          className="btn btn-secondary"
                          style={{ height: '24px', padding: '0 0.4rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--accent)', borderColor: 'rgba(0, 242, 255, 0.3)' }}
                          title="回退到此词条的历史版本"
                        >
                          <RotateCcw size={11} />
                          <span>回退</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Git style Double Column Diff Modal */}
      {activeLog && (() => {
        let parsed;
        try {
          parsed = JSON.parse(activeLog.details);
        } catch {
          // 非 JSON 格式日志（如新建词条、批量导入等）展示完整元信息 + 原文详情
          return (
            <GlossaModal
              isOpen={diffModalOpen}
              onClose={() => setDiffModalOpen(false)}
              title="日志详情"
              maxWidth="560px"
              footer={<button onClick={() => setDiffModalOpen(false)} className="btn btn-primary" style={{ width: '100px' }}>关闭</button>}
            >
              <div style={{ padding: '1rem 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem', background: 'var(--bg-primary)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                  <div>操作成员: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.operator_name || activeLog.operator || '未知用户'}</strong></div>
                  <div>操作时间: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.timestamp}</strong></div>
                  <div>所属数据表: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.version_name || activeLog.version || '通用'}</strong></div>
                  <div>词条键名: <code style={{ color: 'var(--accent)' }}>{activeLog.kw || '-'}</code></div>
                  <div style={{ gridColumn: 'span 2' }}>中文源文: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.chinese || '-'}</strong></div>
                </div>
                <div style={{ marginTop: '1rem', padding: '0 1.5rem' }}>
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>详情内容</div>
                  <pre style={{ margin: 0, padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--text-primary)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', border: '1px solid var(--border-color)', maxHeight: '40vh', overflowY: 'auto' }}>{activeLog.details || '（无详情）'}</pre>
                </div>
              </div>
            </GlossaModal>
          );
        }
        return (
          <GlossaModal
            isOpen={diffModalOpen}
            onClose={() => setDiffModalOpen(false)}
            title="Git 风格对比修改器"
            maxWidth="780px"
            footer={<button onClick={() => setDiffModalOpen(false)} className="btn btn-primary" style={{ width: '100px' }}>关闭</button>}
          >
            <div style={{ padding: '1rem 0' }}>
              {/* Meta details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '1.25rem', fontSize: '0.78rem' }}>
                <div>操作成员: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.operator_name || activeLog.operator || '未知用户'}</strong></div>
                <div>修改时间: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.timestamp}</strong></div>
                <div>所属大表: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.version_name || activeLog.version || '通用'}</strong></div>
                <div>词条键名: <code style={{ color: 'var(--accent)' }}>{activeLog.kw}</code></div>
                <div style={{ gridColumn: 'span 2' }}>中文源文: <strong style={{ color: 'var(--text-primary)' }}>{activeLog.chinese}</strong></div>
                <div style={{ gridColumn: 'span 2' }}>修改字段: <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{parsed.field}</span></div>
              </div>

              {/* Left/Right double columns diff layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', minHeight: '120px' }}>

                {/* Left: Previous (DELETED) */}
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--red-bg)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '0.5rem 0.75rem', fontWeight: 'bold', fontSize: '0.75rem', borderBottom: '1px solid var(--red-bg)' }}>
                    修改前 (Previous Value)
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--red-bg)', color: 'var(--red)', flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {parsed.oldVal || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>[空/未配置]</span>}
                  </div>
                </div>

                {/* Right: Updated (ADDED) */}
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--green-bg)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--green-bg)', color: 'var(--green)', padding: '0.5rem 0.75rem', fontWeight: 'bold', fontSize: '0.75rem', borderBottom: '1px solid var(--green-bg)' }}>
                    修改后 (New Value)
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--green-bg)', color: 'var(--green)', flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {parsed.newVal || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>[已清空]</span>}
                  </div>
                </div>

              </div>
            </div>
          </GlossaModal>
        );
      })()}

      {/* Rollback Modal */}
      <GlossaModal
        isOpen={rollbackModalOpen}
        onClose={() => setRollbackModalOpen(false)}
        title="词条历史回退"
        maxWidth="680px"
        footer={<button onClick={() => setRollbackModalOpen(false)} className="btn btn-secondary" style={{ width: '100px' }}>取消</button>}
      >
        <div style={{ padding: '1rem 0' }}>
          {rollbackLog && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
              <div>词条: <code style={{ color: 'var(--accent)' }}>{rollbackLog.kw}</code></div>
              <div>数据表: <strong style={{ color: 'var(--text-primary)' }}>{rollbackLog.version_name || rollbackLog.version || '通用'}</strong></div>
              <div>中文源词: <strong style={{ color: 'var(--text-primary)' }}>{rollbackLog.chinese || '-'}</strong></div>
              <div>操作记录时间: <span style={{ color: 'var(--text-secondary)' }}>{rollbackLog.timestamp}</span></div>
            </div>
          )}

          <div style={{ marginBottom: '0.5rem', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
            选择要回退到的历史版本（回退前会自动保存当前状态作为"后悔药"）：
          </div>

          {snapshotsLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>加载历史快照中...</div>
          ) : snapshots.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              该词条暂无历史快照（可能从未被修改过，或快照已被清理）
            </div>
          ) : (
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              {snapshots.map((snap, idx) => (
                <div
                  key={snap.id}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: idx < snapshots.length - 1 ? '1px solid var(--border-color)' : 'none',
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    cursor: 'pointer', transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '500', color: 'var(--text-primary)' }}>
                      {snap.createdAt} <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>· {snap.creatorName}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      {Object.entries(snap.translations || {}).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join('  |  ')}
                      {Object.keys(snap.translations || {}).length > 4 ? ' ...' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleConfirmRollback(snap.id)}
                    disabled={rollingBack !== null}
                    className="btn btn-primary"
                    style={{ height: '28px', padding: '0 0.75rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
                  >
                    <RotateCcw size={12} />
                    {rollingBack === snap.id ? '回退中...' : '回退到此版本'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255, 193, 7, 0.08)', border: '1px solid rgba(255, 193, 7, 0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            <ChevronRight size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            回退会将词条的 KW、中文源词和翻译内容恢复到历史版本。回退操作本身也会生成一条新的日志记录。
          </div>
        </div>
      </GlossaModal>

    </div>
  );
}
