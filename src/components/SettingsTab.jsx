import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';

export default function SettingsTab({ 
  onConnectionStatusChange 
}) {
  const [difyUrl, setDifyUrl] = useState('https://api.dify.ai/v1');
  const [difyKey, setDifyKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

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
        }
      } catch (err) {
        console.error('加载 Dify 配置状态失败:', err);
      }
    }
    loadConfig();
  }, []);

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
        setDifyKey(''); // Clear password field on success
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

  const dififyUrlClean = (url) => {
    return (url || '').replace(/\/$/, '').trim();
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

  return (
    <div className="settings-container">
      <h3 className="settings-title">Dify 翻译引擎设置</h3>
      
      {message && (
        <div className={`alert-box alert-box-${message.type === 'success' ? 'success' : 'danger'}`}>
          {message.text}
        </div>
      )}

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
          即 Dify 平台提供的工作流 API 基础路径，若为云服务填 https://api.dify.ai/v1
        </span>
      </div>

      <div className="form-group">
        <label>
          Dify API 密钥 (API Key) 
          {keyConfigured && (
            <span style={{ marginLeft: '0.5rem', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 'bold' }}>
              ● 数据库中已配置有效密钥
            </span>
          )}
        </label>
        <input 
          type="password" 
          value={difyKey} 
          onChange={(e) => setDifyKey(e.target.value)} 
          placeholder={keyConfigured ? "留空保持原配置，输入新密钥覆盖更新" : "app-xxxxxxxxxxxx"}
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

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>配置安全提示</h4>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
          * **后端中转安全防护**：所有的 API 凭证现在均以加密形态存储在您私有的 **SQLite/Postgres 数据库** 中。<br />
          * 前端所有的 AI 翻译和测试连通请求均通过本地后端中转代理，绝不会将您的明文 API Key 泄露给浏览器或第三方。
        </p>
      </div>
    </div>
  );
}
