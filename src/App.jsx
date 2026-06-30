import React, { useState, useEffect, useMemo } from 'react';
import TranslationTab from './components/TranslationTab';
import ComparisonTab from './components/ComparisonTab';
import SettingsTab from './components/SettingsTab';
import { Languages, History, Globe } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('translate');
  
  // Dify Settings (initialized from localStorage)
  const [difyUrl, setDifyUrl] = useState(() => {
    return localStorage.getItem('glossahub_dify_url') || 'https://api.dify.ai/v1';
  });
  const [difyKey, setDifyKey] = useState(() => {
    return localStorage.getItem('glossahub_dify_key') || '';
  });
  const [difyConnected, setDifyConnected] = useState(() => {
    const url = localStorage.getItem('glossahub_dify_url') || 'https://api.dify.ai/v1';
    const key = localStorage.getItem('glossahub_dify_key') || '';
    return !!(url && key);
  });

  // Modification Logs in current session (synced with local Express SQLite server)
  const [sessionLogs, setSessionLogs] = useState([]);

  // Log filter states
  const [filterVersion, setFilterVersion] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Track modified cells in session to highlight: { [recordId]: { [fieldName]: true } }
  const [modifiedCells, setModifiedCells] = useState(() => {
    const saved = localStorage.getItem('glossahub_modified_cells');
    return saved ? JSON.parse(saved) : {};
  });

  // Drawer / Panel state for modification logs
  const [logsOpen, setLogsOpen] = useState(false);



  // Load logs from SQLite on mount
  useEffect(() => {
    async function loadLogs() {
      try {
        const response = await fetch('/api/logs');
        if (response.ok) {
          const data = await response.json();
          setSessionLogs(data);
        }
      } catch (err) {
        console.error('无法从 SQLite 获取日志:', err);
      }
    }
    loadLogs();
  }, []);

  useEffect(() => {
    localStorage.setItem('glossahub_modified_cells', JSON.stringify(modifiedCells));
  }, [modifiedCells]);

  const handleAddLog = async (action, kw = '', chinese = '', details = '', version = '') => {
    try {
      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, kw, chinese, details, version })
      });
      if (response.ok) {
        const newLog = await response.json();
        setSessionLogs(prev => [newLog, ...prev]);
      }
    } catch (err) {
      console.error('写入日志到 SQLite 失败:', err);
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      setSessionLogs(prev => [{
        id: Date.now(),
        timestamp: timeStr,
        kw,
        chinese,
        action,
        details,
        version
      }, ...prev]);
    }
  };

  // Derive unique versions from logs for selection
  const uniqueVersions = useMemo(() => {
    const set = new Set();
    sessionLogs.forEach(log => {
      if (log.version) {
        set.add(log.version);
      }
    });
    return Array.from(set).sort();
  }, [sessionLogs]);

  // Filtered logs list by version and date range
  const filteredLogs = useMemo(() => {
    return sessionLogs.filter(log => {
      // 1. Version filter
      if (filterVersion && log.version !== filterVersion) {
        return false;
      }
      
      // 2. Date range filter
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
  }, [sessionLogs, filterVersion, startDate, endDate]);

  const handleClearLogs = async () => {
    if (window.confirm('确认清空所有协作修改日志与高亮标记吗？')) {
      try {
        await fetch('/api/logs', { method: 'DELETE' });
      } catch (err) {
        console.error('清空 SQLite 日志失败:', err);
      }
      setSessionLogs([]);
      setModifiedCells({});
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="header">
        <div className="header-brand" style={{ gap: '0.5rem' }}>
          <div className="header-logo">
            <Languages size={20} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
            <h2 className="header-title" style={{ fontSize: '1.05rem', margin: 0 }}>GlossaHub</h2>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>迈金词条智能助手</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="header-tabs">
          <button 
            onClick={() => setActiveTab('translate')}
            className={`tab-btn ${activeTab === 'translate' ? 'active' : ''}`}
          >
            智能翻译
          </button>
          <button 
            onClick={() => setActiveTab('compare')}
            className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`}
          >
            版本对比
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          >
            引擎设置
          </button>
        </div>

        {/* Sidebar Trigger (Logs) */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button 
            onClick={() => setLogsOpen(!logsOpen)}
            className={`btn btn-secondary ${sessionLogs.length > 0 ? 'active' : ''}`}
            style={{ 
              borderColor: sessionLogs.length > 0 ? 'var(--yellow)' : 'var(--border-color)',
              height: '28px',
              padding: '0 0.5rem',
              fontSize: '0.72rem',
              whiteSpace: 'nowrap',
              gap: '0.2rem'
            }}
          >
            <History size={13} style={{ color: sessionLogs.length > 0 ? 'var(--yellow)' : 'inherit' }} />
            <span>修改日志 ({sessionLogs.length})</span>
          </button>
        </div>
      </header>



      {/* Main Tab Render Panel */}
      <main className="main-content">
        {activeTab === 'translate' && (
          <TranslationTab 
            difyUrl={difyUrl}
            difyKey={difyKey}
            onAddLog={handleAddLog}
            modifiedCells={modifiedCells}
            setModifiedCells={setModifiedCells}
          />
        )}
        {activeTab === 'compare' && (
          <ComparisonTab />
        )}
        {activeTab === 'settings' && (
          <SettingsTab 
            difyUrl={difyUrl}
            setDifyUrl={setDifyUrl}
            difyKey={difyKey}
            setDifyKey={setDifyKey}
            onConnectionStatusChange={setDifyConnected}
          />
        )}

        {/* Session Modification Logs Drawer */}
        {logsOpen && (
          <div 
            style={{ 
              position: 'absolute', 
              top: 0, 
              right: 0, 
              width: '320px', 
              height: '100%', 
              backgroundColor: 'var(--bg-secondary)', 
              borderLeft: '1px solid var(--border-color)',
              boxShadow: '-4px 0 10px rgba(0,0,0,0.5)',
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={16} /> 本次协作修改日志
              </h4>
              <button onClick={() => setLogsOpen(false)} className="modal-close">✕</button>
            </div>

            {/* Filters Area */}
            {sessionLogs.length > 0 && (
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* Version filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>筛选版本:</span>
                  <select 
                    value={filterVersion}
                    onChange={(e) => setFilterVersion(e.target.value)}
                    className="select-input"
                    style={{ height: '24px', fontSize: '0.72rem', padding: '0 0.2rem', width: '130px' }}
                  >
                    <option value="">全部</option>
                    {uniqueVersions.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                
                {/* Date range filter */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>日期区间:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.target.showPicker();
                        } catch (err) {
                          console.warn('Native picker not supported:', err);
                        }
                      }}
                      className="text-input"
                      style={{ height: '24px', fontSize: '0.7rem', padding: '0 0.2rem', flex: 1, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>至</span>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.target.showPicker();
                        } catch (err) {
                          console.warn('Native picker not supported:', err);
                        }
                      }}
                      className="text-input"
                      style={{ height: '24px', fontSize: '0.7rem', padding: '0 0.2rem', flex: 1, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', cursor: 'pointer' }}
                    />
                    {(startDate || endDate) && (
                      <button 
                        onClick={() => { setStartDate(''); setEndDate(''); }}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: '500' }}
                      >
                        清空
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sessionLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2rem' }}>
                  暂无修改记录，单元格高亮会在修改词条后触发。
                </div>
              ) : filteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2rem' }}>
                  没有找到符合筛选条件的日志记录。
                </div>
              ) : (
                filteredLogs.map((log, idx) => (
                  <div 
                    key={log.id || idx} 
                    style={{ 
                      fontSize: '0.75rem', 
                      lineHeight: '1.4', 
                      padding: '0.5rem', 
                      backgroundColor: 'var(--bg-primary)', 
                      borderRadius: 'var(--radius-sm)', 
                      borderLeft: '2px solid var(--yellow)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.65rem', marginBottom: '0.2rem' }}>
                      <span>⏱️ {log.timestamp}</span>
                      {log.version && (
                        <span style={{ background: 'var(--bg-tertiary)', padding: '0.1rem 0.3rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', color: 'var(--accent)', fontWeight: '500' }}>
                          {log.version}
                        </span>
                      )}
                    </div>
                    <div>
                      <strong>{log.action}</strong>
                      {log.kw && <span className="mono" style={{ marginLeft: '0.4rem', color: 'var(--accent)' }}>[{log.kw}]</span>}
                    </div>
                    {log.chinese && (
                      <div style={{ color: 'var(--text-secondary)', marginTop: '0.1rem', fontSize: '0.7rem' }}>
                        原文: {log.chinese}
                      </div>
                    )}
                    {log.details && (
                      <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem', fontStyle: 'italic' }}>
                        {log.details}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {sessionLogs.length > 0 && (
              <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex' }}>
                <button 
                  onClick={handleClearLogs} 
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                >
                  清除日志与高亮
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="footer">
        <div>GlossaHub v1.1.0 © Magene</div>
        <div className="status-indicator">
          <Globe size={13} />
          <span>Dify 翻译引擎状态:</span>
          <div className={`status-dot ${difyConnected ? 'active' : 'inactive'}`} />
          <span style={{ color: difyConnected ? 'var(--green)' : 'var(--red)' }}>
            {difyConnected ? '已联通 (绿色)' : '未配置 (红色)'}
          </span>
        </div>
      </footer>
    </div>
  );
}
