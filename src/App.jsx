import React, { useState, useEffect, lazy, Suspense } from 'react';
import { apiFetch, safeGetLocalStorage } from './utils/api.js';
import DashboardTab from './components/DashboardTab';
import { SkeletonTab } from './components/Skeleton';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Lazy-load secondary tabs to reduce initial bundle
const TranslationTab = lazy(() => import('./components/TranslationTab'));
const VersionsTab = lazy(() => import('./components/VersionsTab'));
const ComparisonTab = lazy(() => import('./components/ComparisonTab'));
const GlossaryTab = lazy(() => import('./components/GlossaryTab'));
const LanguagesTab = lazy(() => import('./components/LanguagesTab'));
const LogsTab = lazy(() => import('./components/LogsTab'));
const UsersTab = lazy(() => import('./components/UsersTab'));
const SettingsTab = lazy(() => import('./components/SettingsTab'));
import { 
  LayoutDashboard, 
  Languages, 
  ArrowLeftRight, 
  Globe, 
  History, 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  User,
  ShieldCheck,
  Database,
  BookOpen,
  Sun,
  Moon
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('glossahub_sidebar_collapsed') === 'true';
  });

  // 主题状态: 'dark' 或 'light'
  const [theme, setTheme] = useState(() => localStorage.getItem('glossahub_theme') || 'light');

  // 主题切换时动态应用 light-mode CSS 样式并持久化存储
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
    localStorage.setItem('glossahub_theme', theme);
  }, [theme]);

  // Persist sidebar collapse state
  useEffect(() => {
    localStorage.setItem('glossahub_sidebar_collapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  // Clear selectedTableId when switching away from translate tab
  useEffect(() => {
    if (activeTab !== 'translate') {
      setSelectedTableId('');
    }
  }, [activeTab]);

  const handleNavigate = (tab, targetTableId = '') => {
    setActiveTab(tab);
    if (tab !== 'translate') {
      setSelectedTableId('');
    } else if (targetTableId) {
      setSelectedTableId(targetTableId);
    }
  };
  
  // Auth state
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
   const [user, setUser] = useState(() => safeGetLocalStorage('user', null));

  // Multi-tab sync: update user state when storage changes in another tab
  useEffect(() => {
    const loadUser = () => {
      const stored = localStorage.getItem('user');
      if (stored) {
        setUser(safeGetLocalStorage('user', null));
      }
    };
    window.addEventListener('storage', loadUser);
    return () => window.removeEventListener('storage', loadUser);
  }, []);

  // Login form state
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Dify connection status
  const [difyConnected, setDifyConnected] = useState(false);

  // Project Role (RBAC) state
  const [projectRole, setProjectRole] = useState(() => localStorage.getItem('project_role') || 'viewer');

  // Fetch project role whenever token changes
  useEffect(() => {
    if (!token) return;
    async function loadProjectRole() {
      try {
        const res = await apiFetch('/api/projects/proj-default/role');
        if (res.ok) {
          const data = await res.json();
          if (data && data.role) {
            setProjectRole(data.role);
            localStorage.setItem('project_role', data.role);
          }
        }
      } catch (err) {
        console.error('加载项目角色失败:', err);
      }
    }
    loadProjectRole();
  }, [token]);

  // Cell highlight modified state
  const [modifiedCells, setModifiedCells] = useState(() => safeGetLocalStorage('glossahub_modified_cells', {}));

  // Debounced localStorage persistence (avoids blocking main thread on every cell edit)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('glossahub_modified_cells', JSON.stringify(modifiedCells));
      } catch (err) {
        console.warn('Failed to persist modified cells:', err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [modifiedCells]);

  const handleAddLog = async (action, kw = '', chinese = '', details = '', version = '') => {
    if (!token) return;
    try {
      await apiFetch('/api/logs', {
        method: 'POST',
        body: JSON.stringify({ action, kw, chinese, details, version })
      });
    } catch (err) {
      console.error('写入协同日志失败:', err);
    }
  };

  // Fetch dify configurations
  useEffect(() => {
    if (!token) return;
    async function loadDifyState() {
      try {
        const res = await fetch(`${API_BASE}/api/projects/proj-default/dify`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setDifyConnected(data.apiKeyConfigured);
        }
      } catch (err) {
        console.error('加载 Dify 状态失败:', err);
      }
    }
    loadDifyState();
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setLoginError('请输入账号和密码');
      return;
    }

    setLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        setLoginError(data.error || '登录验证失败，请核对凭证！');
      }
    } catch (err) {
      setLoginError('登录失败，请检查用户名和密码。');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('project_role');
    setToken('');
    setUser(null);
    window.location.reload();
  };

  // Breadcrumbs text helper
  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'dashboard': return '仪表盘看板';
      case 'versions': return '数据表管理';
      case 'translate': return '词条管理';
      case 'compare': return '词条变更对比';
      case 'glossary': return '专业词汇库';
      case 'languages': return '语种字典管理';
      case 'logs': return '词条修改日志';
      case 'users': return '用户管理';
      case 'settings': return '翻译引擎设置';
      case 'guide': return '使用指南';
      default: return '词条管理平台';
    }
  };

  // If token is missing, render glossy cyberpunk Login card
  if (!token) {
    return (
      <div className="login-screen flex-center" style={{ height: '100vh', background: 'var(--bg-primary)' }}>
        <div className="login-card" style={{ width: '380px', padding: '2.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div className="flex-center" style={{ background: 'var(--bg-primary)', width: '48px', height: '48px', borderRadius: 'var(--radius-md)', margin: '0 auto 0.75rem auto', color: 'var(--accent)', filter: 'drop-shadow(0 0 8px var(--accent-glow))' }}>
              <Languages size={24} />
            </div>
            <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem', fontWeight: '700', background: 'var(--logo-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              GlossaHub 控制台
            </h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>迈金词条智能管理系统</p>
          </div>

          {loginError && (
            <div className="alert-box alert-box-danger" style={{ marginBottom: '1.25rem', padding: '0.5rem 0.75rem', fontSize: '0.78rem', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)' }}>
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>登录账号</label>
              <input 
                type="text" 
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="请输入用户名"
                className="text-input"
                required
              />
            </div>
            
            <div className="form-group">
              <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>安全密码</label>
              <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="请输入登录密码"
                className="text-input"
                required
              />
            </div>

            <button type="submit" disabled={loggingIn} className="btn btn-primary" style={{ width: '100%', height: '38px', marginTop: '0.5rem' }}>
              {loggingIn ? '正在验证...' : '进入 GlossaHub'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'row', height: '100vh', overflow: 'hidden' }}>
      
      {/* 1. Left Sidebar navigation */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} style={{ width: sidebarCollapsed ? '64px' : '230px', transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        
        {/* Sidebar Header Brand */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid var(--border-color)', height: '60px' }}>
          {!sidebarCollapsed && (
            <div
              onClick={() => window.open('/产品介绍.html', '_blank')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
              title="GlossaHub"
            >
              <div style={{ color: 'var(--accent)' }}>
                <Languages size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                <span style={{ fontWeight: '700', fontSize: '1rem', background: 'var(--logo-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>GlossaHub</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>迈金词条管理平台</span>
              </div>
            </div>
          )}
          
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="icon-btn"
            style={{ margin: sidebarCollapsed ? '0 auto' : '0', padding: '4px' }}
            title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
            aria-label={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Sidebar Navigation links */}
        <nav aria-label="主导航" style={{ padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
          
          {/* Dashboard */}
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`nav-item-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            title="仪表盘看板"
            aria-label="仪表盘看板"
          >
            <LayoutDashboard size={16} />
            {!sidebarCollapsed && <span>仪表盘看板</span>}
          </button>

          {/* Term Matrix */}
          <button 
            onClick={() => setActiveTab('translate')}
            className={`nav-item-btn ${activeTab === 'translate' ? 'active' : ''}`}
            title="词条管理"
            aria-label="词条管理"
          >
            <Languages size={16} />
            {!sidebarCollapsed && <span>词条管理</span>}
          </button>

          {/* Version Comparison */}
          <button 
            onClick={() => setActiveTab('compare')}
            className={`nav-item-btn ${activeTab === 'compare' ? 'active' : ''}`}
            title="词条变更对比"
            aria-label="词条变更对比"
          >
            <ArrowLeftRight size={16} />
            {!sidebarCollapsed && <span>词条变更对比</span>}
          </button>

          {/* Glossary Manager */}
          <button 
            onClick={() => setActiveTab('glossary')}
            className={`nav-item-btn ${activeTab === 'glossary' ? 'active' : ''}`}
            title="专业词汇库"
            aria-label="专业词汇库"
          >
            <BookOpen size={16} />
            {!sidebarCollapsed && <span>专业词汇库</span>}
          </button>

          {/* Versions Manager */}
          <button 
            onClick={() => setActiveTab('versions')}
            className={`nav-item-btn ${activeTab === 'versions' ? 'active' : ''}`}
            title="数据表管理"
            aria-label="数据表管理"
          >
            <Database size={16} />
            {!sidebarCollapsed && <span>数据表管理</span>}
          </button>

          {/* Languages Manager */}
          <button 
            onClick={() => setActiveTab('languages')}
            className={`nav-item-btn ${activeTab === 'languages' ? 'active' : ''}`}
            title="语种字典管理"
            aria-label="语种字典管理"
          >
            <Globe size={16} />
            {!sidebarCollapsed && <span>语种字典管理</span>}
          </button>

          {/* Logs */}
          <button 
            onClick={() => setActiveTab('logs')}
            className={`nav-item-btn ${activeTab === 'logs' ? 'active' : ''}`}
            title="词条修改日志"
            aria-label="词条修改日志"
          >
            <History size={16} />
            {!sidebarCollapsed && <span>词条修改日志</span>}
          </button>

          {/* Users (Admin Only) */}
          {user?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab('users')}
              className={`nav-item-btn ${activeTab === 'users' ? 'active' : ''}`}
              title="用户管理"
              aria-label="用户管理"
            >
              <ShieldCheck size={16} />
              {!sidebarCollapsed && <span>用户管理</span>}
            </button>
          )}

          {/* Settings */}
          <button 
            onClick={() => setActiveTab('settings')}
            className={`nav-item-btn ${activeTab === 'settings' ? 'active' : ''}`}
            title="翻译引擎设置"
            aria-label="翻译引擎设置"
          >
            <Settings size={16} />
            {!sidebarCollapsed && <span>翻译引擎设置</span>}
          </button>

          {/* Operation Guide */}
          <button 
            onClick={() => setActiveTab('guide')}
            className={`nav-item-btn ${activeTab === 'guide' ? 'active' : ''}`}
            title="操作说明"
            aria-label="操作说明"
          >
            <BookOpen size={16} />
            {!sidebarCollapsed && <span>操作说明</span>}
          </button>

        </nav>

        {/* Sidebar Footer Userbadge */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {!sidebarCollapsed ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '50%', padding: '4px', color: 'var(--text-secondary)' }}>
                  <User size={14} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '600' }}>{user?.name || '协作成员'}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '1px' }}>
                    <ShieldCheck size={10} style={{ color: 'var(--green)' }} /> {
                      projectRole === 'owner' ? '所有者' :
                      projectRole === 'editor' ? '译员' : '只读审核'
                    }{user?.role === 'admin' ? ' (超级)' : ''}
                  </span>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="btn btn-secondary" 
                style={{ width: '100%', display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center', height: '28px', fontSize: '0.75rem' }}
              >
                <LogOut size={12} />
                <span>退出登录</span>
              </button>
            </>
          ) : (
            <button 
              onClick={handleLogout}
              className="icon-btn" 
              style={{ margin: '0 auto', padding: '6px', color: 'var(--red)', background: 'var(--bg-primary)' }}
              title="退出登录"
              aria-label="退出登录"
            >
              <LogOut size={14} />
            </button>
          )}
        </div>

      </aside>

      {/* 2. Right 主内容区 */}
      <div className="main-viewport" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* Top bar header */}
        <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1.5rem', height: '60px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
          {/* Breadcrumbs */}
          <div className="breadcrumbs" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>词条管理平台</span>
            <span style={{ margin: '0 0.5rem', color: 'var(--text-muted)' }}>/</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{getBreadcrumbTitle()}</span>
          </div>

          {/* Dify state indicator & Theme Toggle */}
          <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.75rem' }}>
            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                padding: '6px',
                borderRadius: 'var(--radius-md)',
                transition: 'var(--transition)'
              }}
              title={theme === 'dark' ? '切换为明亮模式' : '切换为暗黑模式'}
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <div style={{ width: '1px', height: '14px', background: 'var(--border-color)' }} />

            <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Globe size={13} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Dify 翻译引擎状态:</span>
              <div className={`status-dot ${difyConnected ? 'active' : 'inactive'}`} />
              <span style={{ color: difyConnected ? 'var(--green)' : 'var(--red)', fontWeight: '500' }}>
                {difyConnected ? '已联通' : '未配置'}
              </span>
            </div>
          </div>
        </header>

        {/* Dynamic page container */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div key={activeTab} className="tab-fade-in" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <Suspense fallback={<SkeletonTab />}>
            {activeTab === 'dashboard' && <DashboardTab onNavigate={setActiveTab} />}
            {activeTab === 'versions' && <VersionsTab onNavigate={handleNavigate} projectRole={user?.role === 'admin' ? 'owner' : projectRole} />}
            {activeTab === 'translate' && (
              <TranslationTab
                difyConnected={difyConnected}
                onAddLog={handleAddLog}
                modifiedCells={modifiedCells}
                setModifiedCells={setModifiedCells}
                selectedTableId={selectedTableId}
                setSelectedTableId={setSelectedTableId}
                projectRole={user?.role === 'admin' ? 'owner' : projectRole}
              />
            )}
            {activeTab === 'compare' && <ComparisonTab projectRole={user?.role === 'admin' ? 'owner' : projectRole} />}
            {activeTab === 'glossary' && <GlossaryTab projectRole={user?.role === 'admin' ? 'owner' : projectRole} />}
            {activeTab === 'languages' && <LanguagesTab projectRole={user?.role === 'admin' ? 'owner' : projectRole} />}
            {activeTab === 'logs' && <LogsTab projectRole={user?.role === 'admin' ? 'owner' : projectRole} />}
            {activeTab === 'users' && <UsersTab projectRole={user?.role === 'admin' ? 'owner' : projectRole} />}
            {activeTab === 'settings' && <SettingsTab onConnectionStatusChange={setDifyConnected} projectRole={user?.role === 'admin' ? 'owner' : projectRole} />}
            {activeTab === 'guide' && (
              <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <iframe
                  src="/操作说明.html"
                  style={{ width: '100%', height: '100%', flex: 1, border: 'none', background: 'var(--bg-darker)' }}
                  title="操作说明"
                />
              </div>
            )}
            </Suspense>
          </div>
        </div>

        {/* Footer */}
        <footer className="footer" style={{ height: '36px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0, fontSize: '0.72rem' }}>
          <div>GlossaHub v1.1 © Magene translation platform</div>
        </footer>

      </div>

    </div>
  );
}
