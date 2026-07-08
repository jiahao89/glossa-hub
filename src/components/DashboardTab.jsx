import React, { useState, useEffect } from 'react';
import { Database, FileText, CheckCircle, BarChart3, Activity, Clock, User, Languages, Cpu, Zap } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { Skeleton } from './Skeleton';

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
  const [aiUsage, setAiUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [coverageTab, setCoverageTab] = useState('translation');

  const fetchStats = async () => {
    try {
      const [statsRes, usageRes] = await Promise.all([
        apiFetch('/api/dashboard/stats'),
        apiFetch('/api/dashboard/ai-usage').catch(() => null)
      ]);
      if (!statsRes.ok) {
        throw new Error('拉取看板数据失败');
      }
      const data = await statsRes.json();
      setStats(data);
      if (usageRes && usageRes.ok) {
        setAiUsage(await usageRes.json());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto refresh stats every 10 seconds for real-time collaboration feel
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchStats();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="dashboard-container" style={{ padding: '1.5rem', overflowY: 'auto', height: '100%' }}>
        {/* Welcome Banner 骨架 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ flex: 1 }}>
            <Skeleton width="280px" height={28} style={{ marginBottom: '8px' }} />
            <Skeleton width="420px" height={14} />
          </div>
          <Skeleton width="100px" height={32} radius={6} />
        </div>
        {/* KPI 卡片骨架：4 列 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bento-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <Skeleton variant="circle" width={36} height={36} />
                <Skeleton width="80px" height={12} />
              </div>
              <Skeleton width="60%" height={28} style={{ marginBottom: '4px' }} />
              <Skeleton width="40%" height={12} />
            </div>
          ))}
        </div>
        {/* 下方图表区骨架 */}
        <Skeleton width="180px" height={18} style={{ marginBottom: '12px' }} />
        <Skeleton count={3} height={44} radius={8} />
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
      <div className="welcome-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em' }}>GlossaHub 词条管理平台</h2>
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
            <span className="bento-label">全语种翻译完成率</span>
            <span className="bento-value">{stats.coverage}% <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>{stats.filledCells}/{stats.totalCells} 格</span></span>
          </div>
        </div>

      </div>

      {/* Main Grid content split */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem' }}>
        
        {/* Left Side: Firmware Progress Cards */}
        <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', overflow: 'hidden' }}>
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
                  <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                    <div style={{ width: `${v.progress}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px', transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
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
        <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{log.operator}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{formatLogTime(log.timestamp)}</span>
                      </div>
                      <div className="truncate" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.3' }} title={`在${log.version || '词条表'}修改词条 ${log.kw}: ${parsedDetails}`}>
                        在<strong>{log.version || '词条表'}</strong>修改词条 <code style={{ color: 'var(--accent)', background: 'var(--bg-primary)', padding: '1px 4px', borderRadius: '2px', fontSize: '0.75rem' }}>{log.kw}</code>: {parsedDetails}
                      </div>
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

      {/* P1-2: AI 用量监控卡片 */}
      {aiUsage && (
        <div className="stats-bento" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
          <div className="bento-card">
            <div className="bento-icon-wrapper" style={{ background: 'var(--purple-bg)', color: 'var(--purple)' }}>
              <Cpu size={18} />
            </div>
            <div className="bento-info">
              <span className="bento-label">今日 AI 翻译调用</span>
              <span className="bento-value" style={{ fontSize: '1.5rem' }}>{aiUsage.today.calls} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>次</span></span>
            </div>
          </div>
          <div className="bento-card">
            <div className="bento-icon-wrapper" style={{ background: 'var(--purple-bg)', color: 'var(--purple)' }}>
              <Zap size={18} />
            </div>
            <div className="bento-info">
              <span className="bento-label">今日 Token 消耗</span>
              <span className="bento-value" style={{ fontSize: '1.5rem' }}>{aiUsage.today.tokens > 1000 ? `${(aiUsage.today.tokens / 1000).toFixed(1)}K` : aiUsage.today.tokens} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>tokens</span></span>
            </div>
          </div>
          <div className="bento-card">
            <div className="bento-icon-wrapper" style={{ background: 'var(--purple-bg)', color: 'var(--purple)' }}>
              <Activity size={18} />
            </div>
            <div className="bento-info">
              <span className="bento-label">本周累计</span>
              <span className="bento-value" style={{ fontSize: '1.5rem' }}>{aiUsage.week.calls} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>次 / {aiUsage.week.tokens > 1000 ? `${(aiUsage.week.tokens / 1000).toFixed(1)}K` : aiUsage.week.tokens} tokens</span></span>
            </div>
          </div>
        </div>
      )}

      {/* P1-3: 按语种覆盖率 + 审核覆盖率 Tab */}
      {stats.langProgress && stats.langProgress.length > 0 && (
        <div className="panel-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginTop: '1.5rem', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Languages size={16} style={{ color: 'var(--accent)' }} />
              <span>按语种覆盖率</span>
            </h3>
            {/* Tab 切换 */}
            <div style={{ display: 'flex', gap: '0', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
              <button
                onClick={() => setCoverageTab('translation')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.8rem',
 fontWeight: coverageTab === 'translation' ? '600' : '400',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: coverageTab === 'translation' ? 'var(--bg-primary)' : 'transparent',
                  color: coverageTab === 'translation' ? 'var(--accent)' : 'var(--text-secondary)',
                  transition: 'all 0.2s'
                }}
              >
                翻译覆盖率
              </button>
              <button
                onClick={() => setCoverageTab('review')}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.8rem',
 fontWeight: coverageTab === 'review' ? '600' : '400',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: coverageTab === 'review' ? 'var(--bg-primary)' : 'transparent',
                  color: coverageTab === 'review' ? 'var(--accent)' : 'var(--text-secondary)',
                  transition: 'all 0.2s'
                }}
              >
                审核覆盖率
              </button>
            </div>
          </div>

          {/* Tab 内容 */}
          {coverageTab === 'translation' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {stats.langProgress.map(l => (
                <div key={l.lang} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ minWidth: '100px', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>{l.lang}</span>
                  <div style={{ flex: 1, height: '10px', background: 'var(--bg-tertiary)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        width: `${l.coverage}%`,
                        height: '100%',
                        background: l.coverage >= 80
                          ? 'var(--green)'
                          : l.coverage >= 40
                          ? 'var(--yellow)'
                          : 'var(--red)',
                        borderRadius: '5px',
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    />
                  </div>
                  <span style={{ minWidth: '60px', fontSize: '0.8rem', fontWeight: '600', color: l.coverage >= 80 ? 'var(--green)' : l.coverage >= 40 ? 'var(--yellow)' : 'var(--red)' }}>
                    {l.coverage}%
                  </span>
                  <span style={{ minWidth: '80px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {l.filled}/{l.total}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* 总览 */}
              <div style={{ marginBottom: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                已审核词条: <strong style={{ color: 'var(--accent)' }}>{stats.reviewedTermCount || 0}</strong> / {stats.termCount} 条
                ({stats.reviewCoverage || 0}%)
              </div>
              {(stats.langReviewProgress || []).map(l => (
                <div key={l.lang} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ minWidth: '100px', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>{l.lang}</span>
                  <div style={{ flex: 1, height: '10px', background: 'var(--bg-tertiary)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        width: `${l.coverage}%`,
                        height: '100%',
                        background: l.coverage >= 80
                          ? 'var(--green)'
                          : l.coverage >= 40
                          ? 'var(--yellow)'
                          : 'var(--red)',
                        borderRadius: '5px',
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    />
                  </div>
                  <span style={{ minWidth: '60px', fontSize: '0.8rem', fontWeight: '600', color: l.coverage >= 80 ? 'var(--green)' : l.coverage >= 40 ? 'var(--yellow)' : 'var(--red)' }}>
                    {l.coverage}%
                  </span>
                  <span style={{ minWidth: '80px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {l.filled}/{l.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
