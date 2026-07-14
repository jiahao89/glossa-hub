import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { Trash2, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from './Toast';

export default function SettingsTab({ 
  onConnectionStatusChange,
  projectRole = 'viewer'
}) {
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState('engine'); // 'engine' | 'recycle'

  // Dify Configuration states
  const [difyUrl, setDifyUrl] = useState('https://api.dify.ai/v1');
  const [difyKey, setDifyKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

  // Recycle Bin states
  const [recycleItems, setRecycleItems] = useState([]);
  const [loadingRecycle, setLoadingRecycle] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Load Dify configuration status
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await apiFetch('/api/projects/proj-default/dify');
        if (res.ok) {
          const data = await res.json();
          if (data.baseUrl) {
            setDifyUrl(data.baseUrl);
          }
          setKeyConfigured(data.apiKeyConfigured);
          setIsCustom(!!data.isCustom);
          setShowOverride(!!data.isCustom);
        }
      } catch (err) {
        console.error('加载 Dify 配置状态失败:', err);
      }
    }
    loadConfig();
  }, []);

  const dififyUrlClean = (url) => {
    return (url || '').replace(/\/$/, '').trim();
  };

  const handleSave = async () => {
    if (!difyUrl) {
      setMessage({ type: 'error', text: '接口地址不能为空！' });
      return;
    }
    setSaving(true);
    setMessage(null);

    try {
      const res = await apiFetch('/api/projects/proj-default/dify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ baseUrl: dififyUrlClean(difyUrl), apiKey: difyKey || undefined })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: '配置已成功加密存入数据库！' });
        setKeyConfigured(true);
        setIsCustom(true);
        setDifyKey(''); // Clear password field on success
        onConnectionStatusChange(true);
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: `保存失败: ${data.error}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `保存异常: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!difyUrl) {
      setMessage({ type: 'error', text: '请填写接口地址！' });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      const res = await apiFetch('/api/projects/proj-default/dify-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ baseUrl: dififyUrlClean(difyUrl), apiKey: difyKey || undefined })
      });
      const data = await res.json();
      setTesting(false);

      if (res.ok) {
        setMessage({ type: 'success', text: '连接测试成功！Dify 工作流对接正常。' });
        onConnectionStatusChange(true);
      } else {
        setMessage({ type: 'error', text: `连接测试失败: ${data.error}` });
        onConnectionStatusChange(false);
      }
    } catch (err) {
      setTesting(false);
      setMessage({ type: 'error', text: `请求异常: ${err.message}` });
      onConnectionStatusChange(false);
    }
  };

  // Recycle Bin handlers
  const fetchRecycleItems = async () => {
    setLoadingRecycle(true);
    try {
      const res = await apiFetch('/api/projects/proj-default/recycle-bin');
      if (res.ok) {
        const data = await res.json();
        setRecycleItems(data);
      }
    } catch (err) {
      console.error('加载回收站数据失败:', err);
    } finally {
      setLoadingRecycle(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'recycle') {
      fetchRecycleItems();
    }
  }, [activeSubTab]);

  const handleRestore = async (id, name, type) => {
    const typeCn = type === 'version' ? '数据表' : type === 'language' ? '语种' : '词汇表';
    if (!window.confirm(`确定要恢复已删除的 ${typeCn} [${name}] 吗？恢复后所有关联数据及翻译将完整还原。`)) {
      return;
    }

    setActionLoadingId(id);
    try {
      const res = await apiFetch(`/api/recycle-bin/${id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || '恢复数据成功！');
        fetchRecycleItems();
      } else {
        toast.error(data.error || '恢复数据失败');
      }
    } catch (err) {
      toast.error('网络请求异常: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePurge = async (id, name, type) => {
    const typeCn = type === 'version' ? '数据表' : type === 'language' ? '语种' : '词汇表';
    if (!window.confirm(`⚠️ 警示：彻底删除是毁灭性动作，将无法二次找回！\n您确定要彻底销毁被删除的 ${typeCn} [${name}] 吗？`)) {
      return;
    }

    setActionLoadingId(id);
    try {
      const res = await apiFetch(`/api/recycle-bin/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || '数据已彻底销毁。');
        fetchRecycleItems();
      } else {
        toast.error(data.error || '彻底删除失败');
      }
    } catch (err) {
      toast.error('网络请求异常: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      
      {/* Header */}
      <div className="tab-header" style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
        <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.02em' }}>系统管理与设置</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>配置外部 AI 智能翻译连接，或在数据回收站中找回误删的历史字典数据。</p>
      </div>

      {/* Sub-tabs Selection */}
      {projectRole === 'owner' && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', flexShrink: 0 }}>
          <button 
            onClick={() => setActiveSubTab('engine')}
            className={`btn ${activeSubTab === 'engine' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.82rem', height: '32px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            ⚙️ 翻译引擎设置
          </button>
          <button 
            onClick={() => setActiveSubTab('recycle')}
            className={`btn ${activeSubTab === 'recycle' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.82rem', height: '32px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            🗑️ 数据回收站
          </button>
        </div>
      )}

      {/* SUBTAB 1: Dify Translation Engine */}
      {activeSubTab === 'engine' && (
        <div className="settings-container" style={{ maxWidth: '650px' }}>
          <h3 className="settings-title">Dify 翻译工作流配置</h3>
          
          {message && (
            <div className={`alert-box alert-box-${message.type === 'success' ? 'success' : 'danger'}`} style={{ marginBottom: '1rem' }}>
              {message.text}
            </div>
          )}

          {/* Connection Status Card */}
          <div style={{
            padding: '1rem 1.25rem',
            borderRadius: '0.6rem',
            border: `1px solid var(--border-color)`,
            backgroundColor: 'var(--bg-secondary)',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <div className={`status-dot ${keyConfigured ? 'active' : 'inactive'}`} />
              <strong style={{ fontSize: '0.95rem' }}>
                {keyConfigured ? '翻译引擎已就绪' : '翻译引擎未配置'}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              {keyConfigured
                ? (isCustom
                    ? '当前已配置自定义覆盖接口。如需恢复系统内置默认引擎，请在高级配置中更新。'
                    : '当前使用系统预装的迈金内置 Dify 默认工作流引擎，开箱即用，无需配置。')
                : '系统尚未配置翻译引擎，调用 AI 翻译可能会失败，请在高级配置中填写参数。'}
            </p>
            <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              接口地址: <code>{difyUrl}</code>
            </div>
          </div>

          {/* Toggle advanced override */}
          {projectRole === 'owner' ? (
            <button
              onClick={() => setShowOverride(v => !v)}
              className="btn btn-secondary"
              style={{ marginBottom: '1rem', fontSize: '0.82rem', padding: '0.45rem 0.8rem' }}
            >
              {showOverride ? '收起高级配置' : (isCustom ? '修改自定义覆盖配置' : '连接异常？手动配置覆盖')}
            </button>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontStyle: 'italic' }}>
              * 提示：仅项目所有者 (Owner) 可更改翻译引擎的 API 配置。
            </div>
          )}

          {showOverride && projectRole === 'owner' && (
            <>
              <div className="form-group">
                <label>Dify 接口地址 (Base URL)</label>
                <input 
                  type="text" 
                  value={difyUrl} 
                  onChange={(e) => setDifyUrl(e.target.value)} 
                  placeholder="例如: https://api.dify.ai/v1"
                  className="text-input"
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Dify 平台提供的工作流 API 基础路径，若为云服务填 https://api.dify.ai/v1
                </span>
              </div>

              <div className="form-group">
                <label>
                  Dify API 密钥 (API Key) 
                  {keyConfigured && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      ● {isCustom ? '当前已使用自定义密钥' : '当前使用内置密钥'}
                    </span>
                  )}
                </label>
                <input 
                  type="password" 
                  value={difyKey} 
                  onChange={(e) => setDifyKey(e.target.value)} 
                  placeholder={keyConfigured ? "留空保持当前配置，输入新密钥覆盖更新" : "app-xxxxxxxxxxxx"}
                  className="text-input"
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  在 Dify 对应工作流的“API 访问”页面中生成的密钥，以 app- 开头
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button 
                  onClick={handleTest} 
                  disabled={testing}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  {testing ? '正在测试连接...' : '测试 API 连接'}
                </button>
                
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {saving ? '正在保存...' : '保存配置'}
                </button>
              </div>
            </>
          )}

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>配置安全提示</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              * 平台默认开箱即用，一般无需在此处手动调整参数配置。<br />
              * 所有 API 凭证及请求由后端 Node.js 密闭代理，前端永不接触明文密钥，确保云密钥资产安全。<br />
              * 接口更改后会影响整个项目成员在进行翻译时的翻译请求来源。
            </p>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Recycle Bin */}
      {activeSubTab === 'recycle' && projectRole === 'owner' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          <div className="alert-box alert-box-warning" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem', padding: '0.75rem 1rem', background: 'var(--yellow-bg)', color: 'var(--yellow)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '4px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
              数据回收站为防止误删的安全阀。删除的大表（版本）、语种或专业词汇表会临时保存在回收站中。<strong>30 天后到期条目将被系统自动彻底清理</strong>，期间支持一键无损还原。
            </span>
          </div>

          <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {loadingRecycle ? (
              <div className="flex-center" style={{ flex: 1, gap: '0.5rem', color: 'var(--text-muted)' }}>
                <Loader2 className="animate-spin" size={18} />
                <span style={{ fontSize: '0.85rem' }}>正在检索回收站历史数据...</span>
              </div>
            ) : recycleItems.length === 0 ? (
              <div className="flex-center" style={{ flex: 1, flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)', padding: '4rem 0' }}>
                <span style={{ fontSize: '2.5rem' }}>🗑️</span>
                <span style={{ fontSize: '0.85rem' }}>回收站内空空如也，无任何待清理数据。</span>
              </div>
            ) : (
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>类型</th>
                      <th style={{ padding: '0.75rem 1rem' }}>名称</th>
                      <th style={{ padding: '0.75rem 1rem' }}>删除操作人</th>
                      <th style={{ padding: '0.75rem 1rem' }}>删除时间</th>
                      <th style={{ padding: '0.75rem 1rem' }}>过期自动清除</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>操作选项</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recycleItems.map(item => {
                      const typeCn = item.entity_type === 'version' ? '固件大表' : item.entity_type === 'language' ? '翻译语种' : '词汇大表';
                      const badgeColor = item.entity_type === 'version' ? 'var(--accent)' : item.entity_type === 'language' ? 'var(--purple)' : 'var(--yellow)';
                      const isActionLoading = actionLoadingId === item.id;
                      
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', border: `1px solid ${badgeColor}`, color: badgeColor, borderRadius: '3px' }}>{typeCn}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.entity_name}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>{item.deleted_by_name || '系统管理员'}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{formatDateTime(item.deleted_at)}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--red)', fontWeight: 500 }}>{formatDateTime(item.expires_at)}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                              <button 
                                onClick={() => handleRestore(item.id, item.entity_name, item.entity_type)}
                                disabled={isActionLoading}
                                className="btn btn-secondary"
                                style={{ height: '24px', padding: '0 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem', borderColor: 'rgba(var(--accent-rgb), 0.3)', color: 'var(--accent)' }}
                              >
                                {isActionLoading ? <Loader2 className="animate-spin" size={10} /> : <RotateCcw size={10} />}
                                <span>一键恢复</span>
                              </button>
                              
                              <button 
                                onClick={() => handlePurge(item.id, item.entity_name, item.entity_type)}
                                disabled={isActionLoading}
                                className="btn btn-secondary"
                                style={{ height: '24px', padding: '0 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem', borderColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--red)' }}
                              >
                                {isActionLoading ? <Loader2 className="animate-spin" size={10} /> : <Trash2 size={10} />}
                                <span>彻底删除</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
