import React, { useState, useEffect } from 'react';
import { Database, FileText, CheckCircle, BarChart3, Activity, Clock, User } from 'lucide-react';
import { apiFetch } from '../utils/api';

function formatLogTime(timestampStr) {
  if (!timestampStr) return '';
  let date;
  if (typeof timestampStr === 'string' && timestampStr.includes(' ') && !timestampStr.includes('T')) {
    date = new Date(timestampStr.replace(' ', 'T') + '+08:00');
  } else {
    date = new Date(timestampStr);
  }

  if (isNaN(date.getTime())) {
    return timestampStr;
  }

  const formatterDate = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const formatterTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const now = new Date();
  const todayStr = formatterDate.format(now);
  const logDateStr = formatterDate.format(date);
  const timePart = formatterTime.format(date);
  
  if (todayStr === logDateStr) {
    return timePart;
  } else {
    const ymd = logDateStr.replace(/\//g, '-');
    return `${ymd} ${timePart}`;
  }
}

export default function DashboardTab({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/dashboard/stats');
      if (!res.ok) {
        throw new Error('拉取看板数据失败');
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto refresh stats every 10 seconds for real-time collaboration feel
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '70vh', flexDirection: 'column', gap: '1rem' }}>
        <Activity className="animate-spin text-accent" size={36} style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>正在装载 GlossaHub 仪表盘分析...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-center" style={{ height: '70vh', color: 'var(--red)', flexDirection: 'column', gap: '0.5rem' }}>
        <span>⚠️ 仪表盘加载错误: {error}</span>
        <button onClick={fetchStats} className="btn btn-secondary" style={{ marginTop: '1rem' }}>重试</button>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ padding: '1.5rem', overflowY: 'auto', height: '100%' }}>
      {/* Welcome Banner */}
      <div className="welcome-banner" style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.5rem', fontWeight: '700' }}>GlossaHub 词条管理平台</h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>实时计算多维词条翻译覆盖率、词条翻译就绪状态与团队提交轨迹。</p>
        </div>
        <button onClick={fetchStats} className="btn btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Activity size={14} />
          <span>刷新数据</span>
        </button>
      </div>

      {/* Stats Bento Grid */}
      <div className="stats-bento" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        
        {/* KPI 1 */}
        <div className="bento-card">
          <div className="bento-icon-wrapper" style={{ background: 'rgba(0, 242, 255, 0.08)', color: 'var(--accent)' }}>
            <Database size={20} />
          </div>
          <div className="bento-info">
            <span className="bento-label">固件版本大表</span>
            <span className="bento-value">{stats.versionCount} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>个版本</span></span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bento-card">
          <div className="bento-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.08)', color: 'var(--yellow)' }}>
            <FileText size={20} />
          </div>
          <div className="bento-info">
            <span className="bento-label">中文词条总键数</span>
            <span className="bento-value">{stats.termCount} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>条</span></span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bento-card">
          <div className="bento-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--green)' }}>
            <CheckCircle size={20} />
          </div>
          <div className="bento-info">
            <span className="bento-label">完全翻译完成词条</span>
            <span className="bento-value">{stats.fullyTranslatedCount} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>条 ({stats.termCount > 0 ? Math.round((stats.fullyTranslatedCount / stats.termCount) * 100) : 0}%)</span></span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bento-card">
          <div className="bento-icon-wrapper" style={{ background: 'rgba(0, 242, 255, 0.08)', color: 'var(--accent)' }}>
            <BarChart3 size={20} />
          </div>
          <div className="bento-info">
            <span className="bento-label">全语种翻译格子覆盖率</span>
            <span className="bento-value">{stats.coverage}% <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>{stats.filledCells}/{stats.totalCells} 格</span></span>
          </div>
        </div>

      </div>

      {/* Main Grid content split */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
        
        {/* Left Side: Firmware Progress Cards */}
        <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={16} style={{ color: 'var(--accent)' }} />
            <span>词条翻译进度表</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {stats.tableProgress.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>暂无词条表，请在“数据表管理”中创建。</div>
            ) : (
              stats.tableProgress.map(v => (
                <div key={v.id} className="progress-item" style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{v.name}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 'bold' }}>{v.progress}%</span>
                  </div>
                  
                  {/* Progress Line */}
                  <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                    <div style={{ width: `${v.progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent) 0%, #00b8ff 100%)', borderRadius: '3px', boxShadow: '0 0 8px rgba(0, 242, 255, 0.4)' }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span>包含词条: <strong>{v.totalTerms}</strong> 条</span>
                    <span>全覆盖就绪词条: <strong>{v.fullyTranslatedTerms}</strong> 条</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Modification streams */}
        <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} style={{ color: 'var(--yellow)' }} />
            <span>变更记录</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
            {stats.recentLogs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>暂无协作修改日志。</div>
            ) : (
              stats.recentLogs.map(log => {
                let parsedDetails = log.details;
                try {
                  const parsed = JSON.parse(log.details);
                  if (parsed.field) {
                    parsedDetails = `修改了 [${parsed.field}] 的翻译`;
                  }
                } catch {
                  // Fallback to text details
                }

                return (
                  <div key={log.id} style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                    <div style={{ background: 'var(--bg-tertiary)', borderRadius: '50%', minWidth: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <User size={13} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{log.operator}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{formatLogTime(log.timestamp)}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                        在<strong>{log.version || '词条表'}</strong>修改词条 <code style={{ color: 'var(--accent)', background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '2px', fontSize: '0.75rem' }}>{log.kw}</code>: {parsedDetails}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          <button 
            onClick={() => onNavigate('logs')}
            className="btn btn-secondary" 
            style={{ width: '100%', fontSize: '0.75rem', marginTop: '1rem', height: '32px' }}
          >
            查看完整修改历史日志
          </button>
        </div>

      </div>
    </div>
  );
}
